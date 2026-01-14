/**
 * 认证 Hook
 * 封装认证相关的操作
 */
import { useCallback } from 'react';
import { authApi } from '@/api/auth';
import { useAuthStore } from '@/stores/auth-store';
import type { LoginRequest, RegisterRequest } from '@/types/auth';

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
                console.error('Logout API call failed:', error);
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
        } catch (error) {
            console.error('Failed to refresh user:', error);
        } finally {
            setLoading(false);
        }
    }, [isAuthenticated, setLoading, setUser]);

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
