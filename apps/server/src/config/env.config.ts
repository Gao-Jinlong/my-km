/**
 * 配置服务
 * 提供类型安全的环境变量访问
 *
 * 使用 class-validator 验证环境变量
 * 应用启动时验证失败会立即终止并显示错误信息
 */

import { Injectable, OnModuleInit } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { Environment, EnvironmentVariables } from './dto/env.validation';

@Injectable()
export class EnvConfig implements OnModuleInit {
    private readonly config: EnvironmentVariables;

    constructor() {
        // 验证并转换环境变量
        this.config = this.validate();
    }

    /**
     * 模块初始化时调用
     * 可以在这里添加额外的初始化逻辑
     */
    onModuleInit() {
        // 可选：记录配置信息（注意不要记录敏感信息）
        // console.log(`Environment: ${this.nodeEnv}`);
        // console.log(`Port: ${this.port}`);
    }

    /**
     * 验证环境变量
     * 如果验证失败，抛出错误并显示详细的问题信息
     */
    private validate(): EnvironmentVariables {
        const validatedConfig = plainToInstance(EnvironmentVariables, process.env, {
            enableImplicitConversion: true,
        });

        const errors = validateSync(validatedConfig, {
            skipMissingProperties: false,
        });

        if (errors.length > 0) {
            const errorMessages = errors
                .map(error => {
                    const constraints = error.constraints || {};
                    return Object.values(constraints).join(', ');
                })
                .join('\n');

            throw new Error(
                `❌ Environment validation failed:\n${errorMessages}\n\nPlease check your .env file.`,
            );
        }

        return validatedConfig;
    }

    // ============ Environment ============

    get nodeEnv(): Environment {
        return this.config.NODE_ENV;
    }

    get isDevelopment(): boolean {
        return this.config.NODE_ENV === Environment.DEVELOPMENT;
    }

    get isProduction(): boolean {
        return this.config.NODE_ENV === Environment.PRODUCTION;
    }

    get isTest(): boolean {
        return this.config.NODE_ENV === Environment.TEST;
    }

    get port(): number {
        return this.config.PORT;
    }

    // ============ Database ============

    get databaseUrl(): string {
        return this.config.DATABASE_URL;
    }

    // ============ Logger ============

    get logLevel(): string {
        return this.config.LOG_LEVEL || 'info';
    }

    get logFilePath(): string {
        return this.config.LOG_FILE_PATH || './logs';
    }

    get logMaxSize(): string {
        return this.config.LOG_MAX_SIZE || '20m';
    }

    get logMaxFiles(): string {
        return this.config.LOG_MAX_FILES || '14d';
    }

    // ============ AI Provider ============

    get zhipuaiApiKey(): string | undefined {
        return this.config.ZHIPUAI_API_KEY;
    }

    get aiProvider(): string | undefined {
        return this.config.AI_PROVIDER;
    }

    // ============ CORS ============

    get allowedOrigins(): string[] {
        if (!this.config.ALLOWED_ORIGINS) {
            return ['*']; // 默认允许所有来源
        }
        return this.config.ALLOWED_ORIGINS.split(',').map(origin => origin.trim());
    }

    // ============ JWT ============

    get jwtSecret(): string {
        return this.config.JWT_SECRET;
    }

    get jwtAccessExpiration(): string {
        return this.config.JWT_ACCESS_EXPIRATION || '15m';
    }

    get jwtRefreshExpiration(): string {
        return this.config.JWT_REFRESH_EXPIRATION || '7d';
    }

    // ============ Maildev ============

    get maildevHost(): string {
        return this.config.MAILDEV_HOST || 'localhost';
    }

    get maildevPort(): number {
        return this.config.MAILDEV_PORT || 1025;
    }

    get maildevFrom(): string {
        return this.config.MAILDEV_FROM || 'noreply@my-km.com';
    }

    get maildevFromName(): string {
        return this.config.MAILDEV_FROM_NAME || 'My-KM';
    }

    // ============ Raw Config ============

    /**
     * 获取原始配置对象（只读）
     */
    getAll(): Readonly<EnvironmentVariables> {
        return this.config;
    }
}
