/**
 * API 错误响应类型定义
 */

/**
 * 后端错误响应格式
 */
export interface ApiErrorResponse {
    success: false;
    error: {
        code: string;
        message: string;
        details?: Record<string, unknown>;
    };
    timestamp: string;
    traceId: string;
    path: string;
}

/**
 * 增强的 API 错误类
 * 包含后端返回的完整错误信息
 */
export class ApiError extends Error {
    code: string;
    details?: Record<string, unknown>;
    traceId?: string;
    status: number;

    constructor(
        message: string,
        code: string,
        status: number,
        details?: Record<string, unknown>,
        traceId?: string,
    ) {
        super(message);
        this.name = 'ApiError';
        this.code = code;
        this.status = status;
        this.details = details;
        this.traceId = traceId;
    }
}
