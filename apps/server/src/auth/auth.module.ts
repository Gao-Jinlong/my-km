import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './strategies/jwt.strategy';
import { PasswordService } from './services/password.service';
import { JwtTokenService } from './services/jwt-token.service';
import { TokenService } from './services/token.service';
import { PrismaService } from '../prisma/prisma.service';
import { EmailModule } from '../email/email.module';
import { UsersModule } from '../users/users.module';
import { EnvConfig } from '../config/env.config';

@Module({
    imports: [
        PassportModule.register({ defaultStrategy: 'jwt' }),
        JwtModule.registerAsync({
            inject: [EnvConfig],
            useFactory: (config: EnvConfig) => ({
                secret: config.jwtSecret,
                signOptions: {
                    expiresIn: config.jwtAccessExpiration as any,
                },
            }),
        }),
        EmailModule,
        UsersModule, // Import UsersModule to use UsersService in AuthService
    ],
    controllers: [AuthController],
    providers: [
        AuthService,
        JwtStrategy,
        PasswordService,
        JwtTokenService,
        TokenService,
        PrismaService,
    ],
    exports: [AuthService, JwtStrategy, PasswordService, JwtTokenService, TokenService],
})
export class AuthModule {}
