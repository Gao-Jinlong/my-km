/**
 * 支持的语言类型
 */
export type Locale = 'zh-CN' | 'en';

/**
 * 默认语言
 */
export const DEFAULT_LOCALE: Locale = 'zh-CN';

/**
 * 支持的语言列表
 */
export const SUPPORTED_LOCALES: Locale[] = ['zh-CN', 'en'];

/**
 * 语言显示名称
 */
export const LOCALE_NAMES: Record<Locale, string> = {
    'zh-CN': '简体中文',
    en: 'English',
};
