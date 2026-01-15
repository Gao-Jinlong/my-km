import { getRequestConfig } from 'next-intl/server';
import type { Locale } from './routing';
import { routing } from './routing';

export default getRequestConfig(async ({ requestLocale }) => {
    // 这个回调接收请求的 locale

    // 确保传入的 locale 是有效的
    let locale = await requestLocale;

    // 验证 locale 是否在支持的语言列表中
    if (!locale || !routing.locales.includes(locale as Locale)) {
        locale = routing.defaultLocale;
    }

    let messages: Record<string, unknown>;
    try {
        messages = (await import(`../../messages/${locale}.json`)).default;
    } catch (_error) {
        // 如果加载失败，回退到默认语言
        messages = (await import(`../../messages/${routing.defaultLocale}.json`)).default;
    }

    return {
        locale,
        messages,
    };
});
