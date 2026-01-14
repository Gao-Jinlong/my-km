import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { Tokens, User } from '@/types/auth';
import { clearAuthSession, clearTokens, parseJwt, setTokens } from '@/utils/token';

/**
 * 认证状态管理
 */
interface AuthStoreState {
    // 状态
    user: User | null;
    accessToken: string | null;
    isAuthenticated: boolean;
    isLoading: boolean;

    // 操作
    setAuth: (user: User, tokens: Tokens, rememberMe?: boolean) => void;
    setUser: (user: User | null) => void;
    setAccessToken: (token: string) => void;
    setLoading: (loading: boolean) => void;
    logout: () => void;
    clearAuth: () => void;

    // 辅助方法
    getAuthHeaders: () => { Authorization?: string };
    isTokenExpired: () => boolean;
}

type PersistedState = Pick<AuthStoreState, 'user' | 'isAuthenticated'>;

export const useAuthStore = create<AuthStoreState>()(
    persist(
        (set, get) => ({
            // 初始状态
            user: null,
            accessToken: null,
            isAuthenticated: false,
            isLoading: true,

            // 设置认证信息
            setAuth: (user, tokens, rememberMe = false) => {
                // 存储刷新令牌到 cookie
                setTokens(tokens, rememberMe);

                // 存储访问令牌和用户信息到状态
                set({
                    user,
                    accessToken: tokens.accessToken,
                    isAuthenticated: true,
                    isLoading: false,
                });
            },

            // 设置用户信息
            setUser: user => {
                set({ user });
            },

            // 设置访问令牌
            setAccessToken: token => {
                set({ accessToken: token });
            },

            // 设置加载状态
            setLoading: loading => {
                set({ isLoading: loading });
            },

            // 登出
            logout: () => {
                clearTokens(); // 这现在也会清除认证会话
                clearAuthSession(); // 显式清除以确保安全
                set({
                    user: null,
                    accessToken: null,
                    isAuthenticated: false,
                    isLoading: false,
                });
            },

            // 清除认证信息
            clearAuth: () => {
                set({
                    user: null,
                    accessToken: null,
                    isAuthenticated: false,
                    isLoading: false,
                });
            },

            // 获取认证头
            getAuthHeaders: () => {
                const accessToken = get().accessToken;
                if (!accessToken) return {};

                return {
                    Authorization: `Bearer ${accessToken}`,
                };
            },

            // 检查令牌是否过期
            isTokenExpired: () => {
                const accessToken = get().accessToken;
                if (!accessToken) return true;

                const payload = parseJwt(accessToken);
                if (!payload) return true;

                const currentTime = Math.floor(Date.now() / 1000);
                return payload.exp < currentTime;
            },
        }),
        {
            name: 'auth-storage',
            storage: createJSONStorage(() => localStorage),
            // 只持久化用户信息，不持久化访问令牌
            partialize: (state: AuthStoreState): PersistedState => ({
                user: state.user,
                isAuthenticated: state.isAuthenticated,
            }),
        },
    ),
);

// 导出便捷 hooks
export const useUser = () => useAuthStore(state => state.user);
export const useIsAuthenticated = () => useAuthStore(state => state.isAuthenticated);
export const useIsLoading = () => useAuthStore(state => state.isLoading);
