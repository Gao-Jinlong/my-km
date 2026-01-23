'use client';

import { useEffect } from 'react';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type Theme = 'dark' | 'light' | 'system';

interface ThemeState {
    theme: Theme;
    setTheme: (theme: Theme) => void;
}

export const useThemeStore = create<ThemeState>()(
    persist(
        set => ({
            theme: 'system',
            setTheme: theme => set({ theme }),
        }),
        {
            name: 'theme-storage',
        },
    ),
);

/**
 * 辅助函数：根据当前主题设置更新 DOM
 */
export function updateThemeDOM(theme: Theme) {
    if (typeof window === 'undefined') return;

    const root = window.document.documentElement;
    root.classList.remove('light', 'dark');

    if (theme === 'system') {
        const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        root.classList.add(isDark ? 'dark' : 'light');
    } else {
        root.classList.add(theme);
    }
}

/**
 * 主题初始化组件
 * 负责在客户端初始化和同步主题状态到 DOM
 */
export function ThemeInitializer() {
    const theme = useThemeStore(state => state.theme);

    useEffect(() => {
        // 初始化应用主题
        updateThemeDOM(theme);

        // 如果是系统模式，监听系统主题变化
        if (theme === 'system') {
            const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
            const handleChange = () => updateThemeDOM('system');

            mediaQuery.addEventListener('change', handleChange);
            return () => mediaQuery.removeEventListener('change', handleChange);
        }
    }, [theme]);

    return null;
}
