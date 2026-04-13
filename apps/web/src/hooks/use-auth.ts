/**
 * 认证 Hook
 * 封装认证相关的操作
 */
import { useCallback } from 'react';
import { authApi } from '@/api/auth';
import { getContainer } from '@/platform/bootstrap';
import { MonitorService } from '@/platform/monitor/service';
import { useAuthStore } from '@/stores/auth-store';
import type { LoginRequest, RegisterRequest } from '@/types/auth';

/**
 * 惰性获取 logger，避免模块级循环依赖
 */
function getLogger() {
    return getContainer().get(MonitorService).getLogger('auth');
}

export function useAuth() {
    const { user, isAuthenticated, isLoading, setAuth, setUser, setLoading, logout, clearAuth } =
        useAuthStore();

    /**
     * 登录
     */
    const login = useCallback(
        async (credentials: LoginRequest) => {
            setLoading(true);
            try {
                const response = await authApi.login(credentials);
                setAuth(
                    response.user,
                    {
                        accessToken: response.accessToken,
                        refreshToken: response.refreshToken,
                        expiresIn: response.expiresIn,
                    },
                    credentials.rememberMe,
                );
                return response;
            } finally {
                setLoading(false);
            }
        },
        [setAuth, setLoading],
    );

    /**
     * 注册
     */
    const register = useCallback(
        async (data: RegisterRequest) => {
            setLoading(true);
            try {
                const response = await authApi.register(data);
                return response;
            } finally {
                setLoading(false);
            }
        },
        [setLoading],
    );

    /**
     * 登出
     */
    const logoutAction = useCallback(async () => {
        const refreshToken = localStorage.getItem('refresh_token'); // 或从 cookie 获取
        if (refreshToken) {
            try {
                await authApi.logout(refreshToken);
            } catch (error) {
                getLogger().error('Logout API call failed:', error);
            }
        }
        logout();
    }, [logout]);

    /**
     * 刷新用户信息
     */
    const refreshUser = useCallback(async () => {
        if (!isAuthenticated) return;

        setLoading(true);
        try {
            // TODO: 实现 getMe API 调用
            // const user = await usersApi.getMe()
            // setUser(user)
            // eslint-disable-next-line no-unreachable
            throw new Error('Not implemented');
        } catch (error) {
            getLogger().error('Failed to refresh user:', error);
        } finally {
            setLoading(false);
        }
    }, [isAuthenticated, setLoading]);

    return {
        // 状态
        user,
        isAuthenticated,
        isLoading,

        // 操作
        login,
        register,
        logout: logoutAction,
        refreshUser,
        setUser,
        clearAuth,
    };
}
