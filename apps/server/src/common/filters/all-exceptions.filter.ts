/**
 * 全局异常过滤器
 *
 * 捕获所有未处理的异常，统一返回错误响应
 * - 自动记录日志（根据错误码对应的日志级别）
 * - 格式化错误响应（包含 errorCode、message、traceId）
 * - 开发环境显示错误堆栈，生产环境隐藏
 *
 * 参考 docs/technical/logging-standard.md 中的日志规范
 */

import {
    ArgumentsHost,
    Catch,
    ExceptionFilter,
    HttpException,
    HttpStatus,
    Injectable,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { LoggerService } from '../../logger/logger.service';
import { ERROR_CODE_TO_LOG_LEVEL, ErrorCode } from '../constants/error-codes';
import { BusinessException } from '../exceptions/business.exception';

/**
 * 错误响应接口
 */
interface ErrorResponse {
    success: false;
    error: {
        code: ErrorCode | string;
        message: string;
        details?: any;
        stack?: string;
    };
    timestamp: string;
    traceId: string;
    path: string;
}

/**
 * 全局异常过滤器
 *
 * @example
 * // 在 main.ts 中注册
 * app.useGlobalFilters(new AllExceptionsFilter(logger));
 */
@Injectable()
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
    constructor(private readonly logger: LoggerService) {}

    catch(exception: unknown, host: ArgumentsHost): void {
        const ctx = host.switchToHttp();
        const response = ctx.getResponse<Response>();
        const request = ctx.getRequest<Request>();
        const traceId = request.traceId || 'unknown';

        let status: number;
        let errorCode: ErrorCode | string;
        let message: string;
        let details: any;

        // 处理不同类型的异常
        if (exception instanceof BusinessException) {
            // 自定义业务异常
            status = exception.getStatus();
            errorCode = exception.errorCode;
            message = exception.message;
            details = exception.details;

            // 记录日志（使用错误码对应的日志级别）
            this.logException(exception, traceId, request);
        } else if (exception instanceof HttpException) {
            // NestJS HTTP 异常
            status = exception.getStatus();
            errorCode = this.getErrorCodeFromStatus(status);
            message = exception.message;

            // 记录警告日志
            this.logger.warn('HTTP exception', undefined, {
                traceId,
                status,
                message,
                path: request.path,
                method: request.method,
            });
        } else if (exception instanceof Error) {
            // 未知错误
            status = HttpStatus.INTERNAL_SERVER_ERROR;
            errorCode = ErrorCode.INTERNAL_SERVER_ERROR;
            message = this.isDevelopment() ? exception.message : 'Internal server error';
            details = this.isDevelopment() ? { stack: exception.stack } : undefined;

            // 记录错误日志
            this.logger.errorFromException('Unhandled exception', exception, {
                traceId,
                path: request.path,
                method: request.method,
            });
        } else {
            // 其他类型的异常
            status = HttpStatus.INTERNAL_SERVER_ERROR;
            errorCode = ErrorCode.INTERNAL_SERVER_ERROR;
            message = 'Internal server error';
        }

        // 构建错误响应
        const errorResponse: ErrorResponse = {
            success: false,
            error: {
                code: errorCode,
                message,
                ...(details && { details }),
                ...(this.isDevelopment() &&
                    exception instanceof Error && { stack: exception.stack }),
            },
            timestamp: new Date().toISOString(),
            traceId,
            path: request.path,
        };

        // 发送响应
        response.status(status).json(errorResponse);
    }

    /**
     * 记录业务异常日志
     * 根据错误码对应的日志级别记录
     */
    private logException(exception: BusinessException, traceId: string, request: Request): void {
        const logLevel = ERROR_CODE_TO_LOG_LEVEL[exception.errorCode] || 'error';
        const message = `Business exception: ${exception.errorCode}`;

        const meta = {
            traceId,
            errorCode: exception.errorCode,
            path: request.path,
            method: request.method,
            details: exception.details,
        };

        switch (logLevel) {
            case 'fatal':
                this.logger.fatal(message, meta);
                break;
            case 'error':
                this.logger.error(message, undefined, meta);
                break;
            case 'warn':
                this.logger.warn(message, undefined, meta);
                break;
            default:
                this.logger.error(message, undefined, meta);
        }
    }

    /**
     * 根据 HTTP 状态码获取错误码
     */
    private getErrorCodeFromStatus(status: number): ErrorCode {
        switch (status) {
            case 400:
                return ErrorCode.VALIDATION_ERROR;
            case 401:
                return ErrorCode.UNAUTHORIZED;
            case 403:
                return ErrorCode.FORBIDDEN;
            case 404:
                return ErrorCode.NOT_FOUND;
            case 429:
                return ErrorCode.RATE_LIMIT_EXCEEDED;
            case 500:
                return ErrorCode.INTERNAL_SERVER_ERROR;
            case 503:
                return ErrorCode.DATABASE_CONNECTION_FAILED;
            default:
                return ErrorCode.INTERNAL_SERVER_ERROR;
        }
    }

    /**
     * 判断是否为开发环境
     */
    private isDevelopment(): boolean {
        return process.env.NODE_ENV === 'development';
    }
}
