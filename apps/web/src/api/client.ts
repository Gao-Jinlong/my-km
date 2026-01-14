import ky from 'ky';
import { useAuthStore } from '@/stores/auth-store';
import { shouldRefreshToken } from '@/utils/token';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api/v1';

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
 * 创建 ky 实例
 */
export const apiClient = ky.create({
    prefixUrl: API_BASE_URL,
    timeout: 30000,

    // 请求钩子：添加认证头
    hooks: {
        beforeRequest: [
            async (request, options) => {
                const { accessToken, isAuthenticated } = useAuthStore.getState();

                // 如果已认证且需要访问令牌，添加 Authorization 头
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
            },
        ],

        // 响应钩子：处理 401 错误
        afterResponse: [
            async (request, options, response) => {
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
            },
        ],
    },
});

/**
 * 创建不需要认证的 API 客户端
 */
export const publicApiClient = ky.create({
    prefixUrl: API_BASE_URL,
    timeout: 30000,
});
