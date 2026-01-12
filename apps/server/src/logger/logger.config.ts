/**
 * Logger 配置
 * 根据 docs/technical/logging-standard.md 规范配置
 */

import * as winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';

const logDir = process.env.LOG_FILE_PATH || './logs';
const logLevel = process.env.LOG_LEVEL || 'info';
const isProduction = process.env.NODE_ENV === 'production';
const maxSize = process.env.LOG_MAX_SIZE || '20m';
const maxFiles = process.env.LOG_MAX_FILES || '14d';

// 自定义格式：开发环境（带颜色）
const developmentFormat = winston.format.combine(
    winston.format.colorize({ all: true }),
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.printf(({ timestamp, level, context, message, ...meta }) => {
        const ctx = context ? `[${context}]` : '[Application]';
        const metaStr = Object.keys(meta).length ? JSON.stringify(meta, null, 2) : '';
        return `${timestamp} [${level}] ${ctx} ${message} ${metaStr}`;
    }),
);

// 自定义格式：生产环境（JSON）
const productionFormat = winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DDTHH:mm:ss.SSSZ' }),
    winston.format.errors({ stack: true }),
    winston.format.json(),
);

// 日志传输器配置
const transports: winston.transport[] = [];

// 控制台输出
transports.push(
    new winston.transports.Console({
        format: isProduction ? productionFormat : developmentFormat,
    }),
);

// 文件输出（所有日志）
transports.push(
    new DailyRotateFile({
        dirname: logDir,
        filename: 'application-%DATE%.log',
        datePattern: 'YYYY-MM-DD',
        maxSize: maxSize,
        maxFiles: maxFiles,
        format: productionFormat,
        level: 'info',
    }),
);

// 文件输出（错误日志）
transports.push(
    new DailyRotateFile({
        dirname: logDir,
        filename: 'error-%DATE%.log',
        datePattern: 'YYYY-MM-DD',
        maxSize: maxSize,
        maxFiles: maxFiles,
        format: productionFormat,
        level: 'error',
    }),
);

export const loggerConfig: winston.LoggerOptions = {
    level: logLevel,
    format: isProduction ? productionFormat : developmentFormat,
    transports,
    // 不要在生产环境退出进程
    exitOnError: false,
};

// 导出配置供其他模块使用
export { logDir, logLevel, isProduction };
