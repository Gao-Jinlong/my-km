/**
 * Logger Service
 * 提供统一的日志记录接口，支持敏感数据脱敏和链路追踪
 * 根据 docs/technical/logging-standard.md 规范实现
 */

import { Injectable, LoggerService as NestLoggerService, Scope } from '@nestjs/common';
import * as winston from 'winston';
import { loggerConfig } from './logger.config';
import { SensitiveDataMasker } from './mask.util';

@Injectable({ scope: Scope.TRANSIENT })
export class LoggerService implements NestLoggerService {
    private readonly logger: winston.Logger = winston.createLogger(loggerConfig);

    /**
     * 设置上下文（通常用于标记类名或模块名）
     */
    setContext(context: string) {
        this.logger.defaultMeta = { ...this.logger.defaultMeta, context };
    }

    /**
     * 记录日志（通用方法）
     */
    log(message: string, context?: string, meta?: Record<string, any>): void {
        const maskedMeta = SensitiveDataMasker.maskObject(meta || {});
        this.logger.info(message, {
            ...(context && { context }),
            ...maskedMeta,
        });
    }

    /**
     * 记录信息级别日志
     */
    info(message: string, meta?: Record<string, any>): void {
        const maskedMeta = SensitiveDataMasker.maskObject(meta || {});
        this.logger.info(message, maskedMeta);
    }

    /**
     * 记录错误级别日志
     */
    error(message: string, trace?: string, meta?: Record<string, any>): void {
        const maskedMeta = SensitiveDataMasker.maskObject(meta || {});

        if (trace) {
            this.logger.error(message, {
                ...maskedMeta,
                stack: trace,
            });
        } else {
            this.logger.error(message, maskedMeta);
        }
    }

    /**
     * 记录错误对象
     */
    errorFromException(message: string, error: Error, meta?: Record<string, any>): void {
        const maskedMeta = SensitiveDataMasker.maskObject(meta || {});
        const maskedError = SensitiveDataMasker.maskError(error);

        this.logger.error(message, {
            ...maskedMeta,
            ...maskedError,
        });
    }

    /**
     * 记录警告级别日志
     */
    warn(message: string, context?: string, meta?: Record<string, any>): void {
        const maskedMeta = SensitiveDataMasker.maskObject(meta || {});
        this.logger.warn(message, {
            ...(context && { context }),
            ...maskedMeta,
        });
    }

    /**
     * 记录警告级别日志（简化版）
     */
    warning(message: string, meta?: Record<string, any>): void {
        this.warn(message, undefined, meta);
    }

    /**
     * 记录调试级别日志
     */
    debug(message: string, meta?: Record<string, any>): void {
        const maskedMeta = SensitiveDataMasker.maskObject(meta || {});
        this.logger.debug(message, maskedMeta);
    }

    /**
     * 记录详细追踪级别日志
     */
    trace(message: string, meta?: Record<string, any>): void {
        const maskedMeta = SensitiveDataMasker.maskObject(meta || {});
        this.logger.silly(message, maskedMeta);
    }

    /**
     * 记录致命错误级别日志
     */
    fatal(message: string, meta?: Record<string, any>): void {
        const maskedMeta = SensitiveDataMasker.maskObject(meta || {});
        this.logger.error(`[FATAL] ${message}`, maskedMeta);
    }

    /**
     * 记录带链路追踪 ID 的日志
     */
    logWithTrace(
        message: string,
        traceId: string,
        level: 'info' | 'warn' | 'error' | 'debug' = 'info',
        meta?: Record<string, any>,
    ): void {
        const maskedMeta = SensitiveDataMasker.maskObject(meta || {});
        this.logger[level](message, {
            ...maskedMeta,
            traceId,
        });
    }
}
