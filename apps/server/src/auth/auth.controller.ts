import { Controller, Post, Get, Body, Query, UseGuards, Req } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { Public } from './decorators/current-user.decorator';
import { CurrentUser } from './decorators/current-user.decorator';

@Controller('auth')
export class AuthController {
    constructor(private readonly authService: AuthService) {}

    /**
     * 用户登录
     */
    @Public()
    @Post('login')
    async login(@Body() loginDto: LoginDto, @Req() req: any) {
        const ipAddress = (req.headers['x-forwarded-for'] as string) || (req.headers['x-real-ip'] as string);
        const userAgent = req.headers['user-agent'] as string;

        return this.authService.login(loginDto, ipAddress, userAgent);
    }

    /**
     * 用户登出
     */
    @Post('logout')
    @UseGuards(JwtAuthGuard)
    async logout(@Body() logoutDto: { refreshToken: string }) {
        await this.authService.logout(logoutDto.refreshToken);
        return {
            message: '登出成功',
        };
    }

    /**
     * 刷新 Token
     */
    @Public()
    @Post('refresh')
    async refresh(@Body() refreshTokenDto: RefreshTokenDto, @Req() req: any) {
        const ipAddress = (req.headers['x-forwarded-for'] as string) || (req.headers['x-real-ip'] as string);
        const userAgent = req.headers['user-agent'] as string;

        return this.authService.refreshTokens(refreshTokenDto.refreshToken, userAgent, ipAddress);
    }

    /**
     * 验证邮箱
     */
    @Public()
    @Get('verify-email')
    async verifyEmail(@Query('token') token: string) {
        return this.authService.verifyEmail(token);
    }

    /**
     * 重新发送验证邮件
     */
    @Post('resend-verification')
    @UseGuards(JwtAuthGuard)
    async resendVerificationEmail(@CurrentUser('id') userId: string) {
        return this.authService.resendVerificationEmail(userId);
    }

    /**
     * 请求密码重置
     */
    @Public()
    @Post('forgot-password')
    async forgotPassword(@Body() forgotPasswordDto: ForgotPasswordDto) {
        return this.authService.forgotPassword(forgotPasswordDto.email);
    }

    /**
     * 重置密码
     */
    @Public()
    @Post('reset-password')
    async resetPassword(@Body() resetPasswordDto: ResetPasswordDto) {
        return this.authService.resetPassword(resetPasswordDto.token, resetPasswordDto.newPassword);
    }
}
