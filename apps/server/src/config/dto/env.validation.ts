/**
 * 环境变量验证 DTO
 * 使用 class-validator 进行类型安全的环境变量验证
 */

import { Transform } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

/**
 * 支持的环境类型
 */
export enum Environment {
    DEVELOPMENT = 'development',
    PRODUCTION = 'production',
    TEST = 'test',
}

/**
 * 环境变量验证类
 *
 * 应用启动时会自动验证所有环境变量
 * 如果验证失败，应用将不会启动并显示清晰的错误信息
 */
export class EnvironmentVariables {
    // ============ Application ============

    /**
     * 运行环境
     * @default development
     */
    @IsEnum(Environment)
    NODE_ENV: Environment = Environment.DEVELOPMENT;

    /**
     * 服务器端口
     * @default 3001
     */
    @IsInt()
    @Min(1000)
    @Max(65535)
    @Transform(({ value }) => Number.parseInt(value, 10))
    PORT = 3001;

    // ============ Database ============

    /**
     * 数据库连接字符串
     * @example postgresql://kmuser:kmpass@localhost:5432/km_db
     */
    @IsString()
    DATABASE_URL: string;

    // ============ Logger ============

    /**
     * 日志级别
     * @default info
     * @options fatal | error | warn | info | debug | trace
     */
    @IsEnum(['fatal', 'error', 'warn', 'info', 'debug', 'trace'])
    @IsOptional()
    LOG_LEVEL?: string;

    /**
     * 日志文件路径
     * @default ./logs
     */
    @IsString()
    @IsOptional()
    LOG_FILE_PATH?: string;

    /**
     * 单个日志文件最大大小
     * @default 20m
     * @example 20m, 100m, 1g
     */
    @IsString()
    @IsOptional()
    LOG_MAX_SIZE?: string;

    /**
     * 保留日志文件数量（天）
     * @default 14d
     * @example 7d, 14d, 30d
     */
    @IsString()
    @IsOptional()
    LOG_MAX_FILES?: string;

    // ============ AI Providers ============

    /**
     * 智谱 AI API Key
     * 可选，仅在使用 AI 功能时需要
     */
    @IsString()
    @IsOptional()
    ZHIPUAI_API_KEY?: string;

    /**
     * Anthropic API Key
     */
    @IsString()
    @IsOptional()
    ANTHROPIC_API_KEY?: string;

    /**
     * OpenAI API Key
     */
    @IsString()
    @IsOptional()
    OPENAI_API_KEY?: string;

    /**
     * Alibaba Cloud DashScope API Key
     */
    @IsString()
    @IsOptional()
    DASHSCOPE_API_KEY?: string;

    /**
     * AI 提供商 (default: zhipu)
     */
    @IsString()
    @IsOptional()
    AI_PROVIDER?: string;

    /**
     * Anthropic 默认模型
     */
    @IsString()
    @IsOptional()
    ANTHROPIC_MODEL?: string;

    /**
     * OpenAI 默认模型
     */
    @IsString()
    @IsOptional()
    OPENAI_MODEL?: string;

    // ============ CORS (Optional) ============

    /**
     * 允许的跨域来源
     * @example http://localhost:3000,http://localhost:3001
     */
    @IsString()
    @IsOptional()
    ALLOWED_ORIGINS?: string;

    // ============ JWT ============

    /**
     * JWT 密钥（用于签名 token）
     * @warning 生产环境必须使用强随机字符串
     */
    @IsString()
    JWT_SECRET: string;

    /**
     * Access Token 有效期
     * @default 15m
     * @example 15m, 30m, 1h
     */
    @IsString()
    @IsOptional()
    JWT_ACCESS_EXPIRATION?: string;

    /**
     * Refresh Token 有效期
     * @default 7d
     * @example 7d, 30d
     */
    @IsString()
    @IsOptional()
    JWT_REFRESH_EXPIRATION?: string;

    // ============ Maildev ============

    /**
     * Maildev 主机
     * @default localhost
     */
    @IsString()
    @IsOptional()
    MAILDEV_HOST?: string;

    /**
     * Maildev SMTP 端口
     * @default 1025
     */
    @IsInt()
    @Min(1000)
    @Max(65535)
    @Transform(({ value }) => Number.parseInt(value, 10))
    @IsOptional()
    MAILDEV_PORT?: number;

    /**
     * Maildev Web 界面端口
     * @default 1080
     */
    @IsInt()
    @Min(1000)
    @Max(65535)
    @Transform(({ value }) => Number.parseInt(value, 10))
    @IsOptional()
    MAILDEV_WEB_PORT?: number;

    /**
     * 发件人邮箱
     * @default noreply@my-km.com
     */
    @IsString()
    @IsOptional()
    MAILDEV_FROM?: string;

    /**
     * 发件人名称
     * @default My-KM
     */
    @IsString()
    @IsOptional()
    MAILDEV_FROM_NAME?: string;

    // ============ Frontend ============

    /**
     * 前端 URL（用于生成邮件中的链接）
     * @default http://localhost:4000
     * @example http://localhost:4000
     * @example https://my-km.com
     */
    @IsString()
    @IsOptional()
    FRONTEND_URL?: string;

    // ============ Redis ============

    /**
     * Redis 主机
     * @default localhost
     */
    @IsString()
    @IsOptional()
    REDIS_HOST?: string;

    /**
     * Redis 端口
     * @default 6379
     */
    @IsInt()
    @Min(1000)
    @Max(65535)
    @Transform(({ value }) => Number.parseInt(value, 10))
    @IsOptional()
    REDIS_PORT?: number;

    /**
     * Redis 密码（可选）
     */
    @IsString()
    @IsOptional()
    REDIS_PASSWORD?: string;

    /**
     * Redis 数据库索引
     * @default 0
     */
    @IsInt()
    @Min(0)
    @Max(15)
    @Transform(({ value }) => Number.parseInt(value, 10))
    @IsOptional()
    REDIS_DB?: number;

    /**
     * 缓存 TTL (秒)
     * @default 300 (5 分钟)
     */
    @IsInt()
    @Min(1)
    @Transform(({ value }) => Number.parseInt(value, 10))
    @IsOptional()
    CACHE_TTL?: number;

    /**
     * 缓存键前缀
     * @default my-km:
     */
    @IsString()
    @IsOptional()
    CACHE_KEY_PREFIX?: string;
}
