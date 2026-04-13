/**
 * 错误处理工具函数
 * 用于解析和处理 API 错误
 *
 * 注意：本文件是底层工具，不依赖上层服务
 * 调试信息使用 console 输出
 */

import { HTTPError } from 'ky';
import type { ApiErrorResponse } from '@/types/api';
import { ApiError } from '@/types/api';

/**
 * 从 ky HTTPError 中提取后端错误信息
 *
 * @param error - 捕获的错误对象
 * @returns 解析后的 Error 对象，优先使用后端返回的错误消息
 */
export async function parseApiError(error: unknown): Promise<Error> {
    // 如果已经是 ApiError，直接返回
    if (error instanceof ApiError) {
        return error;
    }

    // 如果是 ky 的 HTTPError，尝试解析响应体
    if (error instanceof HTTPError) {
        try {
            const clone = error.response.clone();
            const errorBody = (await clone.json()) as ApiErrorResponse;

            // 检查是否为后端的标准错误格式
            if (errorBody.success === false && errorBody.error) {
                return new ApiError(
                    errorBody.error.message,
                    errorBody.error.code,
                    error.response.status,
                    errorBody.error.details,
                    errorBody.traceId,
                );
            }
        } catch (parseError) {
            // 无法解析响应体，返回原始错误
            console.warn('[api] Failed to parse API error response:', parseError);
        }
    }

    // 其他错误，返回原始消息或默认消息
    if (error instanceof Error) {
        return error;
    }

    return new Error('An unknown error occurred');
}

/**
 * 获取用户友好的错误消息
 *
 * @param error - 错误对象
 * @returns 用户友好的错误消息
 */
export function getErrorMessage(error: Error): string {
    if (error instanceof ApiError) {
        return error.message;
    }
    return error.message || '操作失败，请稍后再试';
}
