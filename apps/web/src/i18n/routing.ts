import { createNavigation } from 'next-intl/navigation';
import { defineRouting } from 'next-intl/routing';

export const routing = defineRouting({
    // 始终显示语言前缀，例如 /en/dashboard, /zh/dashboard
    localePrefix: 'always',

    // 默认语言
    defaultLocale: 'zh-CN',

    // 支持的语言列表
    locales: ['zh-CN', 'en'],
});

// 创建导航助手
export const { Link, redirect, usePathname, useRouter } = createNavigation(routing);

// 导出 Locale 类型
export type Locale = 'zh-CN' | 'en';
