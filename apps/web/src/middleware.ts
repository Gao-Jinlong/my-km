import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

/**
 * 中间件 - 路由保护
 * 在请求到达应用之前在边缘运行
 */
export function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl;

    // 定义不需要认证的公开路由
    const publicRoutes = [
        '/',
        '/login',
        '/register',
        '/forgot-password',
        '/reset-password',
        '/verify-email',
    ];

    // 定义已认证用户访问时应该重定向到仪表盘的路由
    const authRoutes = ['/login', '/register', '/forgot-password'];

    // 检查当前路径是否是公开路由
    const isPublicRoute = publicRoutes.some(
        route => pathname === route || pathname.startsWith(route),
    );

    // 检查当前路径是否是认证路由
    const isAuthRoute = authRoutes.some(route => pathname === route || pathname.startsWith(route));

    // 从 cookie 获取认证会话
    const authSession = request.cookies.get('auth_session');
    const isAuthenticated = !!authSession?.value;

    // 场景 1: 用户已认证并尝试访问认证路由
    // 将他们重定向到仪表盘
    if (isAuthenticated && isAuthRoute) {
        const url = request.nextUrl.clone();
        url.pathname = '/dashboard';
        return NextResponse.redirect(url);
    }

    // 场景 2: 用户未认证并尝试访问受保护的路由
    // 重定向到登录页，并保留 redirectTo 参数
    if (!isAuthenticated && !isPublicRoute) {
        const url = request.nextUrl.clone();
        url.pathname = '/login';
        // 添加 redirectTo 参数以保留原始目标
        url.searchParams.set('redirectTo', pathname);
        return NextResponse.redirect(url);
    }

    // 场景 3: 允许访问公开路由
    // 场景 4: 如果已认证，允许访问受保护路由
    return NextResponse.next();
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
