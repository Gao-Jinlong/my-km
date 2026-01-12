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

    // ============ AI Provider (Optional) ============

    /**
     * 智谱 AI API Key
     * 可选，仅在使用 AI 功能时需要
     */
    @IsString()
    @IsOptional()
    ZHIPUAI_API_KEY?: string;

    /**
     * AI 提供商
     * @default zhipu
     */
    @IsString()
    @IsOptional()
    AI_PROVIDER?: string;

    // ============ CORS (Optional) ============

    /**
     * 允许的跨域来源
     * @example http://localhost:3000,http://localhost:3001
     */
    @IsString()
    @IsOptional()
    ALLOWED_ORIGINS?: string;
}
