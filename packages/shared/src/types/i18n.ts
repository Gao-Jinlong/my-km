/**
 * 国际化共享类型定义
 */

/**
 * 支持的语言类型
 */
export type Locale = 'zh-CN' | 'en';

/**
 * 语言配置接口
 */
export interface LocaleConfig {
    code: Locale;
    name: string;
    nativeName: string;
    flag?: string;
}

/**
 * 支持的语言列表
 */
export const LOCALES: LocaleConfig[] = [
    {
        code: 'zh-CN',
        name: 'Chinese (Simplified)',
        nativeName: '简体中文',
        flag: '🇨🇳',
    },
    {
        code: 'en',
        name: 'English',
        nativeName: 'English',
        flag: '🇺🇸',
    },
];

/**
 * 默认语言
 */
export const DEFAULT_LOCALE: Locale = 'zh-CN';

/**
 * 翻译消息接口
 */
export interface I18nMessages {
    meta: {
        title: string;
        description: string;
    };
    nav: {
        home: string;
        dashboard: string;
        login: string;
        register: string;
        logout: string;
    };
    auth: {
        login: {
            title: string;
            description: string;
            email: string;
            password: string;
            rememberMe: string;
            submit: string;
            submitting: string;
            noAccount: string;
            register: string;
            forgotPassword: string;
            success: string;
        };
        register: {
            title: string;
            description: string;
            email: string;
            password: string;
            confirmPassword: string;
            submit: string;
            submitting: string;
            hasAccount: string;
            login: string;
            successTitle: string;
            successDescription: string;
            checkEmail: string;
            emailSent: string;
            goToLogin: string;
        };
        forgotPassword: {
            title: string;
            description: string;
            email: string;
            submit: string;
            submitting: string;
            backToLogin: string;
            successTitle: string;
            successDescription: string;
            checkEmail: string;
        };
        resetPassword: {
            title: string;
            description: string;
            password: string;
            confirmPassword: string;
            submit: string;
            submitting: string;
            invalidLink: string;
        };
    };
    validation: {
        email: string;
        passwordRequired: string;
        passwordMinLength: string;
        passwordLowercase: string;
        passwordUppercase: string;
        passwordNumber: string;
        passwordMismatch: string;
        usernameMinLength: string;
        usernameMaxLength: string;
        usernamePattern: string;
        bioMaxLength: string;
    };
    errors: {
        generic: string;
        network: string;
        unauthorized: string;
        forbidden: string;
        notFound: string;
        serverError: string;
        invalidCredentials: string;
        userExists: string;
        userNotFound: string;
        invalidToken: string;
        tokenExpired: string;
    };
    home: {
        title: string;
        subtitle: string;
        description: string;
        getStarted: string;
    };
    dashboard: {
        title: string;
        welcome: string;
    };
}

/**
 * 错误代码类型
 */
export type ErrorCode =
    | 'AUTH_INVALID_CREDENTIALS'
    | 'AUTH_USER_EXISTS'
    | 'AUTH_USER_NOT_FOUND'
    | 'AUTH_INVALID_TOKEN'
    | 'AUTH_TOKEN_EXPIRED'
    | 'VALIDATION_ERROR'
    | 'UNAUTHORIZED'
    | 'FORBIDDEN'
    | 'NOT_FOUND'
    | 'SERVER_ERROR'
    | 'NETWORK_ERROR';

/**
 * i18n 工具函数
 */

/**
 * 检查是否是支持的语言
 */
export function isValidLocale(locale: string): locale is Locale {
    return ['zh-CN', 'en'].includes(locale);
}

/**
 * 获取语言配置
 */
export function getLocaleConfig(locale: Locale): LocaleConfig {
    return LOCALES.find(l => l.code === locale) || LOCALES[0];
}

/**
 * 获取所有支持的语言代码
 */
export function getSupportedLocales(): Locale[] {
    return LOCALES.map(l => l.code);
}
