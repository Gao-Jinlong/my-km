import { Body, Controller, Get, Post, Query, Req, UseGuards } from '@nestjs/common';
import { CurrentLocale } from '../i18n';
import type { Locale } from '../i18n/constants/locales';
import { AuthService } from './auth.service';
import { CurrentUser, Public } from './decorators/current-user.decorator';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

@Controller('auth')
export class AuthController {
    constructor(private readonly authService: AuthService) {}

    /**
     * 用户登录
     */
    @Public()
    @Post('login')
    async login(
        @Body() loginDto: LoginDto,
        @Req() req: {
            headers: { 'x-forwarded-for'?: string; 'x-real-ip'?: string; 'user-agent'?: string };
        },
        @CurrentLocale() locale: Locale,
    ) {
        const ipAddress =
            (req.headers['x-forwarded-for'] as string) || (req.headers['x-real-ip'] as string);
        const userAgent = req.headers['user-agent'] as string;

        return this.authService.login(loginDto, ipAddress, userAgent, locale);
    }

    /**
     * 用户登出
     */
    @Post('logout')
    @UseGuards(JwtAuthGuard)
    async logout(@Body() logoutDto: { refreshToken: string }, @CurrentLocale() locale: Locale) {
        await this.authService.logout(logoutDto.refreshToken);
        return {
            message: this.authService['i18nService'].getErrorMessage('AUTH_LOGOUT_SUCCESS', locale),
        };
    }

    /**
     * 刷新 Token
     */
    @Public()
    @Post('refresh')
    async refresh(
        @Body() refreshTokenDto: RefreshTokenDto,
        @Req() req: {
            headers: { 'x-forwarded-for'?: string; 'x-real-ip'?: string; 'user-agent'?: string };
        },
        @CurrentLocale() _locale: Locale,
    ) {
        const ipAddress =
            (req.headers['x-forwarded-for'] as string) || (req.headers['x-real-ip'] as string);
        const userAgent = req.headers['user-agent'] as string;

        return this.authService.refreshTokens(refreshTokenDto.refreshToken, userAgent, ipAddress);
    }

    /**
     * 验证邮箱
     */
    @Public()
    @Get('verify-email')
    async verifyEmail(@Query('token') token: string, @CurrentLocale() locale: Locale) {
        return this.authService.verifyEmail(token, locale);
    }

    /**
     * 重新发送验证邮件
     */
    @Post('resend-verification')
    @UseGuards(JwtAuthGuard)
    async resendVerificationEmail(
        @CurrentUser('id') userId: string,
        @CurrentLocale() locale: Locale,
    ) {
        return this.authService.resendVerificationEmail(userId, locale);
    }

    /**
     * 请求密码重置
     */
    @Public()
    @Post('forgot-password')
    async forgotPassword(
        @Body() forgotPasswordDto: ForgotPasswordDto,
        @CurrentLocale() locale: Locale,
    ) {
        return this.authService.forgotPassword(forgotPasswordDto.email, locale);
    }

    /**
     * 重置密码
     */
    @Public()
    @Post('reset-password')
    async resetPassword(
        @Body() resetPasswordDto: ResetPasswordDto,
        @CurrentLocale() locale: Locale,
    ) {
        return this.authService.resetPassword(
            resetPasswordDto.token,
            resetPasswordDto.newPassword,
            locale,
        );
    }
}
