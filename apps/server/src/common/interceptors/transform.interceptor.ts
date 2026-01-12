/**
 * 响应转换拦截器
 *
 * 统一封装 API 响应格式，添加以下元数据：
 * - success: 成功标识
 * - timestamp: 响应时间戳
 * - traceId: 链路追踪 ID
 * - duration: 请求处理时长（毫秒）
 *
 * 参考 docs/technical/api-design.md 中的响应格式规范
 */

import {
    CallHandler,
    ExecutionContext,
    Injectable,
    NestInterceptor,
    StreamableFile,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { SKIP_RESPONSE_WRAP_KEY } from '../decorators/skip-response-wrap.decorator';

/**
 * 标准响应接口
 */
export interface Response<T = any> {
    success: true;
    data: T;
    message?: string;
    timestamp: string;
    traceId: string;
    duration: number;
}

/**
 * 响应转换拦截器
 *
 * @example
 * // 在 main.ts 中注册
 * app.useGlobalInterceptors(new TransformInterceptor(app.get(Reflector)));
 *
 * @example
 * // 正常响应
 * // @Get('articles/:id')
 * // findOne(@Param('id') id: string) {
 * //   return this.articlesService.findOne(id);
 * // }
 *
 * // 输出:
 * // {
 * //   "success": true,
 * //   "data": { "id": "123", "title": "..." },
 * //   "timestamp": "2026-01-12T10:30:45.123Z",
 * //   "traceId": "1705024645123-abc123xyz",
 * //   "duration": 125
 * // }
 *
 * @example
 * // 跳过封装（如 SSE）
 * // @SkipResponseWrap()
 * // @Sse('events')
 * // streamEvents() {
 * //   return Observable;
 * // }
 */
@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<T, Response<T>> {
    constructor(private reflector: Reflector) {}

    intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
        // 检查是否跳过响应封装
        const skipWrap = this.reflector.getAllAndOverride<boolean>(SKIP_RESPONSE_WRAP_KEY, [
            context.getHandler(),
            context.getClass(),
        ]);

        if (skipWrap) {
            return next.handle();
        }

        const ctx = context.switchToHttp();
        const request = ctx.getRequest();
        const traceId = request.traceId || 'unknown';

        return next.handle().pipe(
            map(data => {
                // 计算响应时间
                const duration = request.startTime ? Date.now() - request.startTime : 0;

                // 处理 StreamableFile（文件下载）
                if (data instanceof StreamableFile) {
                    return data;
                }

                // 检查响应是否已经是标准格式
                if (data && typeof data === 'object' && 'success' in data) {
                    return {
                        ...data,
                        timestamp: new Date().toISOString(),
                        traceId,
                        duration,
                    };
                }

                // 标准响应格式
                const apiResponse: Response<T> = {
                    success: true,
                    data,
                    timestamp: new Date().toISOString(),
                    traceId,
                    duration,
                };

                // 可选：根据不同的操作添加默认消息
                // const method = request.method;
                // const statusCode = response.statusCode;
                // if (statusCode >= 200 && statusCode < 300) {
                //   apiResponse.message = this.getDefaultMessage(method, statusCode);
                // }

                return apiResponse;
            }),
        );
    }

    /**
     * 获取默认响应消息（可选）
     *
     * private getDefaultMessage(method: string, statusCode: number): string {
     *   const messages = {
     *     POST: 'Resource created successfully',
     *     GET: 'Resource retrieved successfully',
     *     PATCH: 'Resource updated successfully',
     *     DELETE: 'Resource deleted successfully',
     *   };
     *   return messages[method] || 'Operation successful';
     * }
     */
}
