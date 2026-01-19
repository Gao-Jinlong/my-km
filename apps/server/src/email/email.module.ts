import { join } from 'node:path';
import { Module } from '@nestjs/common';
import { MailerModule } from '@nestjs-modules/mailer';
import { HandlebarsAdapter } from '@nestjs-modules/mailer/dist/adapters/handlebars.adapter';
import { EnvConfig } from '../config/env.config';
import { EmailService } from './email.service';

// 模板目录路径 - 兼容开发和生产环境
const TEMPLATES_DIR = join(process.cwd(), 'src', 'email', 'templates');

@Module({
    imports: [
        MailerModule.forRootAsync({
            inject: [EnvConfig],
            useFactory: (config: EnvConfig) => ({
                transport: {
                    host: config.maildevHost,
                    port: config.maildevPort,
                    secure: false, // maildev 不需要 TLS
                },
                defaults: {
                    from: `"${config.maildevFromName}" <${config.maildevFrom}>`,
                },
                template: {
                    dir: TEMPLATES_DIR,
                    adapter: new HandlebarsAdapter(),
                    options: {
                        strict: true,
                    },
                },
            }),
        }),
    ],
    providers: [EmailService],
    exports: [EmailService],
})
export class EmailModule {}
