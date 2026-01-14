import { MailerService } from '@nestjs-modules/mailer';
import { Injectable } from '@nestjs/common';
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
     */
    async sendVerificationEmail(email: string, username: string, token: string): Promise<void> {
        const verifyUrl = `${this.getFrontendUrl()}/verify-email?token=${token}`;

        await this.mailerService.sendMail({
            to: email,
            subject: '验证您的邮箱地址 - My-KM',
            template: 'verification-email',
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
     */
    async sendPasswordResetEmail(email: string, username: string, token: string): Promise<void> {
        const resetUrl = `${this.getFrontendUrl()}/reset-password?token=${token}`;

        await this.mailerService.sendMail({
            to: email,
            subject: '重置您的密码 - My-KM',
            template: 'reset-password-email',
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
     */
    async sendWelcomeEmail(email: string, username: string): Promise<void> {
        await this.mailerService.sendMail({
            to: email,
            subject: '欢迎加入 My-KM！',
            template: 'welcome-email',
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
