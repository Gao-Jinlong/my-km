import { Locale } from './locales';

/**
 * 错误代码类型
 */
export type ErrorCode =
    | 'AUTH_INVALID_CREDENTIALS'
    | 'AUTH_USER_EXISTS'
    | 'AUTH_USER_NOT_FOUND'
    | 'AUTH_INVALID_TOKEN'
    | 'AUTH_TOKEN_EXPIRED'
    | 'AUTH_VERIFICATION_SUCCESS'
    | 'AUTH_VERIFICATION_ALREADY_VERIFIED'
    | 'AUTH_VERIFICATION_SENT'
    | 'AUTH_PASSWORD_RESET_EMAIL_SENT'
    | 'AUTH_PASSWORD_RESET_LINK_USED'
    | 'AUTH_PASSWORD_RESET_SUCCESS'
    | 'AUTH_LOGOUT_SUCCESS'
    | 'VALIDATION_ERROR'
    | 'UNAUTHORIZED'
    | 'FORBIDDEN'
    | 'NOT_FOUND'
    | 'SERVER_ERROR'
    | 'NETWORK_ERROR';

/**
 * 错误消息翻译
 */
const errorMessages: Record<Locale, Record<ErrorCode, string>> = {
    'zh-CN': {
        AUTH_INVALID_CREDENTIALS: '邮箱或密码错误',
        AUTH_USER_EXISTS: '该邮箱已被注册',
        AUTH_USER_NOT_FOUND: '用户不存在',
        AUTH_INVALID_TOKEN: '无效的链接',
        AUTH_TOKEN_EXPIRED: '链接已过期',
        AUTH_VERIFICATION_SUCCESS: '邮箱验证成功',
        AUTH_VERIFICATION_ALREADY_VERIFIED: '邮箱已验证',
        AUTH_VERIFICATION_SENT: '验证邮件已发送',
        AUTH_PASSWORD_RESET_EMAIL_SENT: '如果该邮箱已注册，您将收到密码重置邮件',
        AUTH_PASSWORD_RESET_LINK_USED: '此链接已被使用',
        AUTH_PASSWORD_RESET_SUCCESS: '密码重置成功，请使用新密码登录',
        AUTH_LOGOUT_SUCCESS: '登出成功',
        VALIDATION_ERROR: '表单验证失败',
        UNAUTHORIZED: '您需要登录才能访问此页面',
        FORBIDDEN: '您没有权限访问此页面',
        NOT_FOUND: '页面未找到',
        SERVER_ERROR: '服务器错误，请稍后再试',
        NETWORK_ERROR: '网络连接失败，请检查您的网络',
    },
    en: {
        AUTH_INVALID_CREDENTIALS: 'Invalid email or password',
        AUTH_USER_EXISTS: 'This email is already registered',
        AUTH_USER_NOT_FOUND: 'User not found',
        AUTH_INVALID_TOKEN: 'Invalid link',
        AUTH_TOKEN_EXPIRED: 'Link has expired',
        AUTH_VERIFICATION_SUCCESS: 'Email verified successfully',
        AUTH_VERIFICATION_ALREADY_VERIFIED: 'Email already verified',
        AUTH_VERIFICATION_SENT: 'Verification email sent',
        AUTH_PASSWORD_RESET_EMAIL_SENT:
            'If this email is registered, you will receive a password reset email',
        AUTH_PASSWORD_RESET_LINK_USED: 'This link has already been used',
        AUTH_PASSWORD_RESET_SUCCESS:
            'Password reset successful, please login with your new password',
        AUTH_LOGOUT_SUCCESS: 'Logout successful',
        VALIDATION_ERROR: 'Validation error',
        UNAUTHORIZED: 'You need to login to access this page',
        FORBIDDEN: "You don't have permission to access this page",
        NOT_FOUND: 'Page not found',
        SERVER_ERROR: 'Server error, please try again later',
        NETWORK_ERROR: 'Network connection failed, please check your network',
    },
};

/**
 * 根据错误代码和语言获取错误消息
 */
export function getErrorMessage(errorCode: ErrorCode, locale: Locale = 'zh-CN'): string {
    return (
        errorMessages[locale]?.[errorCode] || errorMessages['zh-CN'][errorCode] || 'Unknown error'
    );
}

/**
 * 通用翻译函数
 */
export function translate(key: string, locale: Locale = 'zh-CN'): string {
    if (key.startsWith('errors.')) {
        const errorCode = key.replace('errors.', '') as ErrorCode;
        return getErrorMessage(errorCode, locale);
    }
    return key;
}
