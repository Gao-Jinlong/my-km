/**
 * Logger Middleware
 * 记录所有 HTTP 请求和响应
 * 根据 docs/technical/logging-standard.md 规范实现
 *
 * 优化：使用依赖注入的 LoggerService，支持敏感数据自动脱敏
 */

import { generateTraceId } from '@my-km/shared';
import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { LoggerService } from './logger.service';

/**
 * 扩展 Express Request 类型
 */
declare global {
    namespace Express {
        interface Request {
            traceId: string;
            startTime: number;
        }
    }
}

/**
 * HTTP 请求日志中间件
 *
 * 功能：
 * - 自动生成或获取 Trace ID（链路追踪）
 * - 记录请求开始和完成
 * - 根据状态码选择日志级别
 * - 自动脱敏敏感数据（IP、User-Agent 等）
 */
@Injectable()
export class LoggerMiddleware implements NestMiddleware {
    constructor(private readonly logger: LoggerService) {
        this.logger.setContext('HTTP');
    }

    use(req: Request, res: Response, next: NextFunction): void {
        // 生成或获取 Trace ID
        req.traceId = (req.headers['x-trace-id'] as string) || generateTraceId();
        req.startTime = Date.now();

        // 记录请求开始（使用自定义 LoggerService，支持敏感数据脱敏）
        this.logger.info('Incoming request', {
            method: req.method,
            path: req.path,
            traceId: req.traceId,
            ip: req.ip, // 会被自动脱敏
            userAgent: req.get('user-agent'), // 会被自动脱敏
        });

        // 监听响应完成事件
        res.on('finish', () => {
            const duration = Date.now() - req.startTime;
            const { statusCode } = res;

            // 根据状态码选择日志级别
            if (statusCode >= 500) {
                this.logger.error('Request failed', undefined, {
                    method: req.method,
                    path: req.path,
                    statusCode,
                    duration,
                    traceId: req.traceId,
                });
            } else if (statusCode >= 400) {
                this.logger.warn('Request error', undefined, {
                    method: req.method,
                    path: req.path,
                    statusCode,
                    duration,
                    traceId: req.traceId,
                });
            } else {
                this.logger.info('Request completed', {
                    method: req.method,
                    path: req.path,
                    statusCode,
                    duration,
                    traceId: req.traceId,
                });
            }
        });

        next();
    }
}
