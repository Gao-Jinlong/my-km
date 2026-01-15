import { Injectable } from '@nestjs/common';
import { MailerService } from '@nestjs-modules/mailer';
import { EnvConfig } from '../config/env.config';

@Injectable()
export class EmailService {
    constructor(
        private readonly mailerService: MailerService,
        private readonly envConfig: EnvConfig,
    ) {}

    /**
     * 发送邮箱验证邮件
     * @param email 用户邮箱
     * @param username 用户名
     * @param token 验证 token
     * @param locale 语言（默认 'zh-CN'）
     */
    async sendVerificationEmail(
        email: string,
        username: string,
        token: string,
        locale: string = 'zh-CN',
    ): Promise<void> {
        const verifyUrl = `${this.getFrontendUrl()}/verify-email?token=${token}`;

        // 根据语言选择模板和主题
        const template = locale === 'en' ? 'verification-email-en' : 'verification-email';
        const subject =
            locale === 'en' ? 'Verify Your Email Address - My-KM' : '验证您的邮箱地址 - My-KM';

        await this.mailerService.sendMail({
            to: email,
            subject,
            template,
            context: {
                username: username || email.split('@')[0],
                verifyUrl,
                year: new Date().getFullYear(),
            },
        });
    }

    /**
     * 发送密码重置邮件
     * @param email 用户邮箱
     * @param username 用户名
     * @param token 重置 token
     * @param locale 语言（默认 'zh-CN'）
     */
    async sendPasswordResetEmail(
        email: string,
        username: string,
        token: string,
        locale: string = 'zh-CN',
    ): Promise<void> {
        const resetUrl = `${this.getFrontendUrl()}/reset-password?token=${token}`;

        // 根据语言选择模板和主题
        const template = locale === 'en' ? 'reset-password-email-en' : 'reset-password-email';
        const subject = locale === 'en' ? 'Reset Your Password - My-KM' : '重置您的密码 - My-KM';

        await this.mailerService.sendMail({
            to: email,
            subject,
            template,
            context: {
                username: username || email.split('@')[0],
                resetUrl,
                year: new Date().getFullYear(),
            },
        });
    }

    /**
     * 发送欢迎邮件（可选）
     * @param email 用户邮箱
     * @param username 用户名
     * @param locale 语言（默认 'zh-CN'）
     */
    async sendWelcomeEmail(
        email: string,
        username: string,
        locale: string = 'zh-CN',
    ): Promise<void> {
        // 根据语言选择模板和主题
        const template = locale === 'en' ? 'welcome-email-en' : 'welcome-email';
        const subject = locale === 'en' ? 'Welcome to My-KM!' : '欢迎加入 My-KM！';

        await this.mailerService.sendMail({
            to: email,
            subject,
            template,
            context: {
                username: username || email.split('@')[0],
                year: new Date().getFullYear(),
            },
        });
    }

    /**
     * 获取前端 URL
     */
    private getFrontendUrl(): string {
        return this.envConfig.frontendUrl;
    }
}
