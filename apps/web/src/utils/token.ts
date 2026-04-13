/**
 * Token 管理工具
 * 处理 JWT Token 的存储、验证和刷新
 *
 * 注意：本文件是底层工具，不依赖上层服务（如 LoggerService）
 * 调试信息使用 console 输出
 */
import Cookies from 'js-cookie';
import type { JwtPayload, Tokens } from '@/types/auth';

const ACCESS_TOKEN_KEY = 'access_token';
const REFRESH_TOKEN_KEY = 'refresh_token';
const AUTH_SESSION_KEY = 'auth_session';

/**
 * 获取访问令牌
 */
export function getAccessToken(): string | undefined {
    // 访问令牌存储在内存中（通过 Zustand）
    // 这里仅用于从 cookie 中读取备用
    return Cookies.get(ACCESS_TOKEN_KEY);
}

/**
 * 获取刷新令牌
 */
export function getRefreshToken(): string | undefined {
    return Cookies.get(REFRESH_TOKEN_KEY);
}

/**
 * 设置令牌
 */
export function setTokens(tokens: Tokens, rememberMe = false): void {
    // 刷新令牌存储在 cookie 中
    const cookieOptions: Cookies.CookieAttributes = {
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        // rememberMe 为 true 时，有效期 30 天，否则 7 天
        expires: rememberMe ? 30 : 7,
    };

    Cookies.set(REFRESH_TOKEN_KEY, tokens.refreshToken, cookieOptions);

    // 解码访问令牌以获取用户 ID，并设置认证会话
    const payload = parseJwt(tokens.accessToken);
    if (payload?.sub) {
        setAuthSession(payload.sub, rememberMe);
    }

    // 访问令牌只存储在内存中（通过 Zustand），不存储在 cookie 或 localStorage
    // 这样可以减少 XSS 风险
}

/**
 * 清除所有令牌
 */
export function clearTokens(): void {
    Cookies.remove(ACCESS_TOKEN_KEY);
    Cookies.remove(REFRESH_TOKEN_KEY);
    Cookies.remove(AUTH_SESSION_KEY); // 清除认证会话
}

/**
 * 解析 JWT Token
 */
export function parseJwt(token: string): JwtPayload | null {
    try {
        const base64Url = token.split('.')[1];
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        const jsonPayload = decodeURIComponent(
            atob(base64)
                .split('')
                .map(c => `%${(`00${c.charCodeAt(0).toString(16)}`).slice(-2)}`)
                .join(''),
        );
        return JSON.parse(jsonPayload) as JwtPayload;
    } catch (error) {
        console.error('[token] Failed to parse JWT:', error);
        return null;
    }
}

/**
 * 检查访问令牌是否过期
 */
export function isAccessTokenExpired(token: string): boolean {
    const payload = parseJwt(token);
    if (!payload) return true;

    const currentTime = Math.floor(Date.now() / 1000);
    return payload.exp < currentTime;
}

/**
 * 获取访问令牌的剩余有效时间（秒）
 */
export function getAccessTokenTimeRemaining(token: string): number {
    const payload = parseJwt(token);
    if (!payload) return 0;

    const currentTime = Math.floor(Date.now() / 1000);
    return Math.max(0, payload.exp - currentTime);
}

/**
 * 检查是否应该在下次请求前刷新令牌
 * 如果剩余时间少于 5 分钟，返回 true
 */
export function shouldRefreshToken(token: string): boolean {
    const remaining = getAccessTokenTimeRemaining(token);
    return remaining < 300; // 5 分钟 = 300 秒
}

/**
 * 设置认证会话 cookie，用于中间件验证
 * 此 cookie 包含最少的用户信息，用于服务端认证检查
 */
export function setAuthSession(userId: string, rememberMe = false): void {
    const cookieOptions: Cookies.CookieAttributes = {
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        expires: rememberMe ? 30 : 7, // 与刷新令牌过期时间匹配
        // 注意：不是 httpOnly，以便我们可以在客户端组件中读取（如果需要）
        // 在生产环境中，考虑使用 httpOnly 并使用服务端组件
    };

    Cookies.set(AUTH_SESSION_KEY, userId, cookieOptions);
}

/**
 * 获取认证会话
 */
export function getAuthSession(): string | undefined {
    return Cookies.get(AUTH_SESSION_KEY);
}

/**
 * 清除认证会话 cookie
 */
export function clearAuthSession(): void {
    Cookies.remove(AUTH_SESSION_KEY);
}
