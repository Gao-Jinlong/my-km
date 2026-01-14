import { randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { CacheTTL } from '../cache/cache.constants';
import { CacheService } from '../cache/cache.service';
import { ErrorCode } from '../common/constants/error-codes';
import { BusinessException } from '../common/exceptions/business.exception';
import { EnvConfig } from '../config/env.config';
import { EmailService } from '../email/email.service';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { LoginDto } from './dto/login.dto';
import { JwtTokenService } from './services/jwt-token.service';
import { PasswordService } from './services/password.service';
import { TokenService } from './services/token.service';

@Injectable()
export class AuthService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly passwordService: PasswordService,
        private readonly jwtTokenService: JwtTokenService,
        private readonly tokenService: TokenService,
        private readonly emailService: EmailService,
        private readonly envConfig: EnvConfig,
        private readonly cache: CacheService,
        private readonly usersService: UsersService,
    ) {}

    /**
     * 用户登录
     * @param loginDto 登录数据
     * @returns Tokens 和用户信息
     */
    async login(loginDto: LoginDto, ipAddress?: string, userAgent?: string) {
        const { email, password, rememberMe } = loginDto;

        // 查找用户（使用 UsersService）
        const user = await this.usersService.findByEmailWithPassword(email);

        if (!user) {
            throw new BusinessException(ErrorCode.INVALID_CREDENTIALS, '邮箱或密码错误');
        }

        // 验证密码
        const isPasswordValid = await this.passwordService.comparePassword(
            password,
            user.password || '',
        );

        if (!isPasswordValid) {
            throw new BusinessException(ErrorCode.INVALID_CREDENTIALS, '邮箱或密码错误');
        }

        // 检查邮箱是否已验证
        if (!user.isEmailVerified) {
            throw new BusinessException(ErrorCode.AUTH_EMAIL_NOT_VERIFIED);
        }

        // 检查账户是否激活
        if (!user.isActive) {
            throw new BusinessException(ErrorCode.AUTH_ACCOUNT_LOCKED);
        }

        // 生成 tokens
        const accessToken = await this.jwtTokenService.generateAccessToken(user.id, user.email);
        const refreshToken = await this.tokenService.createSession(
            user.id,
            rememberMe || false,
            userAgent,
            ipAddress,
        );

        // 更新最后登录时间
        await this.usersService.updateLastLogin(user.id);

        // Cache user session (optional)
        const sessionKey = this.cache.getSessionKey(user.id);
        await this.cache.set(
            sessionKey,
            {
                userId: user.id,
                email: user.email,
                lastLoginAt: new Date(),
            },
            CacheTTL.SESSION,
        );

        return {
            accessToken,
            refreshToken,
            expiresIn: this.envConfig.jwtAccessExpiration,
            user: {
                id: user.id,
                email: user.email,
                username: user.username,
                avatar: user.avatar,
                isEmailVerified: user.isEmailVerified,
            },
        };
    }

    /**
     * 用户登出
     * @param refreshToken Refresh Token
     */
    async logout(refreshToken: string): Promise<void> {
        await this.tokenService.revokeSession(refreshToken);
    }

    /**
     * 刷新 Tokens
     * @param refreshToken 旧的 Refresh Token
     * @param userAgent 用户代理
     * @param ipAddress IP 地址
     * @returns 新的 Tokens
     */
    async refreshTokens(refreshToken: string, userAgent?: string, ipAddress?: string) {
        return this.tokenService.refreshSession(refreshToken, userAgent, ipAddress);
    }

    /**
     * 验证邮箱
     * @param token 验证 token
     */
    async verifyEmail(token: string) {
        // 查找验证记录
        const verification = await this.prisma.emailVerification.findUnique({
            where: { token },
            include: { user: true },
        });

        if (!verification) {
            throw new BusinessException(ErrorCode.AUTH_TOKEN_INVALID, '无效的验证链接');
        }

        // 检查是否过期
        if (verification.expiresAt < new Date()) {
            // 删除过期的 token
            await this.prisma.emailVerification.delete({
                where: { id: verification.id },
            });
            throw new BusinessException(ErrorCode.AUTH_TOKEN_EXPIRED, '验证链接已过期');
        }

        // 更新用户状态（使用 UsersService）
        await this.usersService.markEmailVerified(verification.userId);

        // 删除验证 token
        await this.prisma.emailVerification.delete({
            where: { id: verification.id },
        });

        // 发送欢迎邮件（异步）
        this.emailService
            .sendWelcomeEmail(
                verification.user.email,
                verification.user.username || verification.user.email,
            )
            .catch(error => {
                console.error('发送欢迎邮件失败:', error);
            });

        return {
            message: '邮箱验证成功',
        };
    }

    /**
     * 重新发送验证邮件
     * @param userId 用户 ID
     */
    async resendVerificationEmail(userId: string) {
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
        });

        if (!user) {
            throw new BusinessException(ErrorCode.NOT_FOUND, '用户不存在');
        }

        if (user.isEmailVerified) {
            throw new BusinessException(ErrorCode.VALIDATION_ERROR, '邮箱已验证');
        }

        // 删除旧的验证 token（如果存在）
        await this.prisma.emailVerification.deleteMany({
            where: { userId },
        });

        // 生成新的验证 token
        const token = this.generateSecureToken();
        const expiresAt = new Date();
        expiresAt.setHours(expiresAt.getHours() + 24);

        await this.prisma.emailVerification.create({
            data: {
                userId: user.id,
                token,
                expiresAt,
            },
        });

        // 发送验证邮件
        await this.emailService.sendVerificationEmail(
            user.email,
            user.username || user.email,
            token,
        );

        return {
            message: '验证邮件已发送',
        };
    }

    /**
     * 请求密码重置
     * @param email 邮箱
     */
    async forgotPassword(email: string) {
        const user = await this.prisma.user.findUnique({
            where: { email },
        });

        // 即使用户不存在也返回成功，防止邮箱枚举攻击
        if (!user) {
            return {
                message: '如果该邮箱已注册，您将收到密码重置邮件',
            };
        }

        // 删除旧的重置 token（如果存在）
        await this.prisma.passwordReset.deleteMany({
            where: { userId: user.id },
        });

        // 生成重置 token
        const token = this.generateSecureToken();
        const expiresAt = new Date();
        expiresAt.setHours(expiresAt.getHours() + 1); // 1 小时后过期

        await this.prisma.passwordReset.create({
            data: {
                userId: user.id,
                token,
                expiresAt,
            },
        });

        // 发送重置邮件
        await this.emailService.sendPasswordResetEmail(
            user.email,
            user.username || user.email,
            token,
        );

        return {
            message: '如果该邮箱已注册，您将收到密码重置邮件',
        };
    }

    /**
     * 重置密码
     * @param token 重置 token
     * @param newPassword 新密码
     */
    async resetPassword(token: string, newPassword: string) {
        // 查找重置记录
        const reset = await this.prisma.passwordReset.findUnique({
            where: { token },
            include: { user: true },
        });

        if (!reset) {
            throw new BusinessException(ErrorCode.AUTH_TOKEN_INVALID, '无效的重置链接');
        }

        // 检查是否已使用
        if (reset.usedAt) {
            throw new BusinessException(ErrorCode.VALIDATION_ERROR, '此链接已被使用');
        }

        // 检查是否过期
        if (reset.expiresAt < new Date()) {
            throw new BusinessException(ErrorCode.AUTH_TOKEN_EXPIRED, '重置链接已过期');
        }

        // 更新密码（使用 UsersService）
        await this.usersService.updatePassword(reset.userId, newPassword);

        // 标记 token 为已使用
        await this.prisma.passwordReset.update({
            where: { id: reset.id },
            data: { usedAt: new Date() },
        });

        // 使所有 session 失效
        await this.tokenService.revokeAllUserSessions(reset.userId);

        return {
            message: '密码重置成功，请使用新密码登录',
        };
    }

    /**
     * Generate secure random token (for email verification and password reset)
     */
    private generateSecureToken(): string {
        return randomBytes(32).toString('hex');
    }
}
