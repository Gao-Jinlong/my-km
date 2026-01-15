/**
 * 支持的语言类型
 */
export type Locale = 'zh-CN' | 'en';

/**
 * 支持的语言列表
 */
export const locales: Locale[] = ['zh-CN', 'en'];

/**
 * 默认语言
 */
export const defaultLocale: Locale = 'zh-CN';

/**
 * 语言显示名称配置
 */
export const localeNames: Record<Locale, string> = {
    'zh-CN': '简体中文',
    en: 'English',
};

/**
 * 语言国旗配置
 */
export const localeFlags: Record<Locale, string> = {
    'zh-CN': '🇨🇳',
    en: '🇺🇸',
};
