'use client';

import { useEffect } from 'react';
import { useAuthStore } from '@/stores/auth-store';

/**
 * 认证提供器组件
 * 在应用挂载时从 localStorage 初始化认证状态
 * 确保服务端和客户端之间的认证状态同步
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
    const { setLoading } = useAuthStore();

    useEffect(() => {
        // 认证状态通过 Zustand persist 从 localStorage 自动水合
        // 我们只需要在水合后设置 loading 为 false
        const timer = setTimeout(() => {
            setLoading(false);
        }, 100);

        return () => clearTimeout(timer);
    }, [setLoading]);

    return <>{children}</>;
}
