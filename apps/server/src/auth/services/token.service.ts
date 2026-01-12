import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { JwtTokenService } from './jwt-token.service';
import { BusinessException } from '../../common/exceptions/business.exception';
import { ErrorCode } from '../../common/constants/error-codes';

/**
 * Token 会话服务
 * 负责管理 Refresh Token 会话（创建、刷新、撤销）
 */
@Injectable()
export class TokenService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly jwtTokenService: JwtTokenService,
    ) {}

    /**
     * 创建 Session
     * @param userId 用户 ID
     * @param rememberMe 是否记住我
     * @param userAgent 用户代理
     * @param ipAddress IP 地址
     * @returns Refresh Token
     */
    async createSession(
        userId: string,
        rememberMe = false,
        userAgent?: string,
        ipAddress?: string,
    ): Promise<string> {
        // 生成 Refresh Token
        const refreshToken = await this.jwtTokenService.generateRefreshToken(userId, rememberMe);

        // 计算过期时间
        const defaultExpiration = 7; // 7 天
        const rememberMeExpiration = 30; // 30 天
        const expirationDays = rememberMe ? rememberMeExpiration : defaultExpiration;

        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + expirationDays);

        // 保存到数据库
        await this.prisma.session.create({
            data: {
                userId,
                refreshToken,
                userAgent,
                ipAddress,
                expiresAt,
            },
        });

        return refreshToken;
    }

    /**
     * 刷新 Session（Token 轮换）
     * @param oldRefreshToken 旧的 Refresh Token
     * @param userAgent 用户代理
     * @param ipAddress IP 地址
     * @returns 新的 Access Token 和 Refresh Token
     */
    async refreshSession(
        oldRefreshToken: string,
        userAgent?: string,
        ipAddress?: string,
    ): Promise<{ accessToken: string; refreshToken: string }> {
        // 验证旧 Token
        const payload = await this.jwtTokenService.verifyRefreshToken(oldRefreshToken);

        // 查找 Session
        const session = await this.prisma.session.findUnique({
            where: { refreshToken: oldRefreshToken },
            include: { user: true },
        });

        if (!session) {
            throw new BusinessException(ErrorCode.AUTH_SESSION_NOT_FOUND);
        }

        if (!session.isActive) {
            throw new BusinessException(ErrorCode.AUTH_SESSION_NOT_FOUND);
        }

        if (session.expiresAt < new Date()) {
            throw new BusinessException(ErrorCode.AUTH_TOKEN_EXPIRED);
        }

        if (!session.user.isActive) {
            throw new BusinessException(ErrorCode.AUTH_ACCOUNT_LOCKED);
        }

        // 删除旧 Session
        await this.prisma.session.delete({
            where: { id: session.id },
        });

        // 创建新 Session（Token 轮换）
        const rememberMe = session.expiresAt > new Date(Date.now() + 14 * 24 * 60 * 60 * 1000); // 超过 14 天视为"记住我"
        const newRefreshToken = await this.createSession(
            session.userId,
            rememberMe,
            userAgent,
            ipAddress,
        );

        // 生成新的 Access Token
        const accessToken = await this.jwtTokenService.generateAccessToken(
            session.userId,
            session.user.email,
        );

        return {
            accessToken,
            refreshToken: newRefreshToken,
        };
    }

    /**
     * 撤销 Session（登出）
     * @param refreshToken Refresh Token
     */
    async revokeSession(refreshToken: string): Promise<void> {
        await this.prisma.session.deleteMany({
            where: { refreshToken },
        });
    }

    /**
     * 撤销用户的所有 Session（用于密码重置、账户删除等）
     * @param userId 用户 ID
     */
    async revokeAllUserSessions(userId: string): Promise<void> {
        await this.prisma.session.deleteMany({
            where: { userId },
        });
    }

    /**
     * 验证 Session 是否有效
     * @param refreshToken Refresh Token
     * @returns Session 是否有效
     */
    async isSessionValid(refreshToken: string): Promise<boolean> {
        const session = await this.prisma.session.findUnique({
            where: { refreshToken },
        });

        if (!session || !session.isActive) {
            return false;
        }

        if (session.expiresAt < new Date()) {
            return false;
        }

        return true;
    }
}
