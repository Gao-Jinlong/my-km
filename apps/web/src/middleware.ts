import type { NextRequest } from 'next/server';
import createMiddleware from 'next-intl/middleware';
import { routing } from './i18n/routing';

/**
 * 创建 next-intl 中间件
 */
const intlMiddleware = createMiddleware(routing);

/**
 * 简化的中间件 - 仅处理 i18n
 * 所有路由均为公开访问，支持匿名使用
 */
export function middleware(request: NextRequest) {
    // 仅运行 i18n 中间件处理语言路由
    return intlMiddleware(request);
}

/**
 * 配置中间件应该在哪些路由上运行
 */
export const config = {
    matcher: [
        /*
         * 匹配所有请求路径，除了:
         * - api 路由（单独处理）
         * - _next/static (静态文件)
         * - _next/image (图片优化文件)
         * - favicon.ico (favicon 文件)
         * - public 文件（图片等）
         */
        '/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
    ],
};
