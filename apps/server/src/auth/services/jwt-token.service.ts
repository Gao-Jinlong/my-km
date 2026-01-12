import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ErrorCode } from '../../common/constants/error-codes';
import { BusinessException } from '../../common/exceptions/business.exception';
import { EnvConfig } from '../../config/env.config';

/**
 * JWT Token 服务
 * 负责 Access Token 和 Refresh Token 的生成和验证
 */
@Injectable()
export class JwtTokenService {
    constructor(
        private readonly jwtService: JwtService,
        private readonly envConfig: EnvConfig,
    ) {}

    /**
     * 生成 Access Token
     * @param userId 用户 ID
     * @param email 用户邮箱
     * @returns Access Token
     */
    async generateAccessToken(userId: string, email: string): Promise<string> {
        const expiresIn = this.envConfig.jwtAccessExpiration;

        return this.jwtService.signAsync(
            {
                sub: userId,
                email,
                type: 'access',
            },
            { expiresIn: expiresIn as any },
        );
    }

    /**
     * 生成 Refresh Token
     * @param userId 用户 ID
     * @param rememberMe 是否记住我（影响过期时间）
     * @returns Refresh Token
     */
    async generateRefreshToken(userId: string, rememberMe = false): Promise<string> {
        const defaultExpiration = '7d';
        const rememberMeExpiration = '30d';
        const expiresIn = rememberMe ? rememberMeExpiration : defaultExpiration;

        return this.jwtService.signAsync(
            {
                sub: userId,
                type: 'refresh',
            },
            { expiresIn: expiresIn as any },
        );
    }

    /**
     * 验证 Token
     * @param token JWT Token
     * @returns Token payload
     * @throws BusinessException 如果 token 无效或过期
     */
    async verifyToken(token: string): Promise<any> {
        try {
            return await this.jwtService.verifyAsync(token);
        } catch (error) {
            if (error.name === 'TokenExpiredError') {
                throw new BusinessException(ErrorCode.AUTH_TOKEN_EXPIRED);
            }
            throw new BusinessException(ErrorCode.AUTH_TOKEN_INVALID);
        }
    }

    /**
     * 验证 Access Token
     * @param token Access Token
     * @returns Token payload
     */
    async verifyAccessToken(token: string): Promise<{ sub: string; email: string }> {
        const payload = await this.verifyToken(token);

        if (payload.type !== 'access') {
            throw new BusinessException(ErrorCode.AUTH_TOKEN_INVALID);
        }

        return {
            sub: payload.sub,
            email: payload.email,
        };
    }

    /**
     * 验证 Refresh Token
     * @param token Refresh Token
     * @returns Token payload
     */
    async verifyRefreshToken(token: string): Promise<{ sub: string }> {
        const payload = await this.verifyToken(token);

        if (payload.type !== 'refresh') {
            throw new BusinessException(ErrorCode.AUTH_TOKEN_INVALID);
        }

        return {
            sub: payload.sub,
        };
    }

    /**
     * 从 Token 中提取用户 ID（不验证）
     * @param token JWT Token
     * @returns 用户 ID
     */
    extractUserId(token: string): string | null {
        try {
            const payload = this.jwtService.decode(token) as any;
            return payload?.sub || null;
        } catch {
            return null;
        }
    }
}
