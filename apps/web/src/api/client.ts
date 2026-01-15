import ky, { type HTTPError } from 'ky';
import { useAuthStore } from '@/stores/auth-store';
import type { ApiErrorResponse } from '@/types/api';
import { shouldRefreshToken } from '@/utils/token';

interface EnhancedError extends Error {
    code?: string;
    details?: Record<string, unknown>;
    traceId?: string;
}

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api/v1';

/**
 * 公共的 ky 配置
 */
const commonKyConfig = {
    prefixUrl: API_BASE_URL,
    timeout: 30000,
};

// 创建一个刷新 token 的 Promise，避免并发刷新
let refreshPromise: Promise<string | null> | null = null;

/**
 * 刷新访问令牌
 */
async function refreshAccessToken(): Promise<string | null> {
    // 如果已经在刷新中，返回相同的 Promise
    if (refreshPromise) {
        return refreshPromise;
    }

    refreshPromise = (async () => {
        try {
            const refreshToken = localStorage.getItem('refresh_token'); // 或者从 cookie 获取
            if (!refreshToken) {
                throw new Error('No refresh token available');
            }

            const response = await ky
                .post(`${API_BASE_URL}/auth/refresh`, {
                    json: { refreshToken },
                })
                .json<{ accessToken: string; refreshToken: string; expiresIn: number }>();

            // 更新 store 中的访问令牌
            useAuthStore.getState().setAccessToken(response.accessToken);

            // 如果返回了新的刷新令牌（token rotation），也需要更新
            if (response.refreshToken) {
                // TODO: 更新存储的刷新令牌
            }

            return response.accessToken;
        } catch (error) {
            console.error('Failed to refresh token:', error);
            // 刷新失败，清除认证信息
            useAuthStore.getState().logout();
            return null;
        } finally {
            refreshPromise = null;
        }
    })();

    return refreshPromise;
}

/**
 * 从 URL 路径中提取语言并设置 X-Locale 请求头
 */
function setLocaleHeader(request: Request): void {
    if (typeof window !== 'undefined') {
        const pathname = window.location.pathname;
        const localeMatch = pathname.match(/^\/(zh-CN|en)(\/|$)/);
        if (localeMatch) {
            const locale = localeMatch[1];
            request.headers.set('X-Locale', locale);
        }
    }
}

/**
 * 创建错误处理钩子
 * 解析 API 错误响应并增强错误对象
 */
function createErrorHook() {
    return async (error: HTTPError) => {
        const err = error as EnhancedError & HTTPError;

        try {
            const errorBody = (await err.response.json()) as ApiErrorResponse;

            if (errorBody.success === false && errorBody.error) {
                const message = errorBody.error.message;

                // 使用 Object.defineProperty 覆盖只读的 message 属性
                Object.defineProperty(err, 'message', {
                    value: message,
                    writable: true,
                    enumerable: true,
                    configurable: true,
                });

                // 附加额外的错误信息
                err.code = errorBody.error.code;
                err.details = errorBody.error.details;
                err.traceId = errorBody.traceId;
            }
        } catch (parseError) {
            console.debug('Failed to parse error response:', parseError);
        }

        return error;
    };
}

/**
 * 设置认证请求头
 * 检查令牌是否需要刷新并设置 Authorization 头
 */
async function setAuthHeader(request: Request): Promise<void> {
    const { accessToken, isAuthenticated } = useAuthStore.getState();

    if (isAuthenticated && accessToken) {
        // 检查是否需要刷新令牌
        if (shouldRefreshToken(accessToken)) {
            const newToken = await refreshAccessToken();
            if (newToken) {
                request.headers.set('Authorization', `Bearer ${newToken}`);
            } else {
                // 刷新失败，继续使用旧令牌（可能会导致 401）
                request.headers.set('Authorization', `Bearer ${accessToken}`);
            }
        } else {
            request.headers.set('Authorization', `Bearer ${accessToken}`);
        }
    }
}

/**
 * 创建 401 响应处理器
 * 尝试刷新令牌并重试请求
 */
function create401ResponseHandler() {
    return async (request: Request, options: RequestInit, response: Response) => {
        // 如果返回 401，尝试刷新令牌并重试
        if (response.status === 401) {
            const { isAuthenticated } = useAuthStore.getState();

            if (isAuthenticated) {
                // 尝试刷新令牌
                const newToken = await refreshAccessToken();

                if (newToken) {
                    // 重试原始请求
                    const retryOptions = {
                        ...options,
                        headers: {
                            ...options.headers,
                            Authorization: `Bearer ${newToken}`,
                        },
                    };

                    return ky(request, retryOptions);
                }

                // 刷新失败，清除认证信息并跳转到登录
                useAuthStore.getState().logout();

                // 保留当前路径在 redirectTo 参数中
                if (typeof window !== 'undefined') {
                    const currentPath = window.location.pathname + window.location.search;
                    window.location.href = `/login?redirectTo=${encodeURIComponent(currentPath)}`;
                }
            }
        }
    };
}

/**
 * 创建需要认证的 API 客户端
 */
export const apiClient = ky.create({
    ...commonKyConfig,

    hooks: {
        beforeRequest: [setLocaleHeader, setAuthHeader],
        afterResponse: [create401ResponseHandler()],
        beforeError: [createErrorHook()],
    },
});

/**
 * 创建不需要认证的 API 客户端
 */
export const publicApiClient = ky.create({
    ...commonKyConfig,

    hooks: {
        beforeRequest: [setLocaleHeader],
        beforeError: [createErrorHook()],
    },
});
