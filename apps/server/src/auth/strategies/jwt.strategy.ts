import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { EnvConfig } from '../../config/env.config';
import { PrismaService } from '../../prisma/prisma.service';
import { JwtTokenService } from '../services/jwt-token.service';

/**
 * JWT 认证策略
 * 从请求头中提取并验证 JWT Token
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
    constructor(
        readonly envConfig: EnvConfig,
        readonly _jwtTokenService: JwtTokenService,
        private readonly prisma: PrismaService,
    ) {
        super({
            jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
            ignoreExpiration: false,
            secretOrKey: envConfig.jwtSecret,
        });
    }

    /**
     * 验证 Token payload
     * @param payload Token payload
     * @returns 用户信息
     */
    async validate(payload: { type: string; sub: string }) {
        // 确保 token 类型是 access
        if (payload.type !== 'access') {
            throw new UnauthorizedException('Invalid token type');
        }

        // 查询用户是否存在且激活
        const user = await this.prisma.user.findUnique({
            where: { id: payload.sub },
            select: {
                id: true,
                email: true,
                username: true,
                avatar: true,
                bio: true,
                isEmailVerified: true,
                isActive: true,
                createdAt: true,
                updatedAt: true,
                lastLoginAt: true,
            },
        });

        if (!user) {
            throw new UnauthorizedException('User not found');
        }

        if (!user.isActive) {
            throw new UnauthorizedException('Account is locked');
        }

        return user;
    }
}
