import { Injectable } from '@nestjs/common';
import { ErrorCode, getErrorMessage, translate } from './constants/error-messages';
import { DEFAULT_LOCALE, type Locale } from './constants/locales';

@Injectable()
export class I18nService {
    /**
     * 获取错误消息
     * @param errorCode - 错误代码
     * @param locale - 语言
     * @returns 翻译后的错误消息
     */
    getErrorMessage(errorCode: ErrorCode, locale: Locale = DEFAULT_LOCALE): string {
        return getErrorMessage(errorCode, locale);
    }

    /**
     * 翻译
     * @param key - 翻译 key
     * @param locale - 语言
     * @returns 翻译后的文本
     */
    translate(key: string, locale: Locale = DEFAULT_LOCALE): string {
        return translate(key, locale);
    }

    /**
     * 从 Accept-Language 请求头检测语言
     * @param acceptLanguage - Accept-Language 请求头
     * @returns 检测到的语言
     */
    detectLocaleFromHeader(acceptLanguage?: string): Locale {
        if (!acceptLanguage) {
            return DEFAULT_LOCALE;
        }

        // 解析 Accept-Language 请求头
        // 例如: "zh-CN,zh;q=0.9,en;q=0.8"
        const languages = acceptLanguage.split(',').map(lang => {
            const [code, qValue] = lang.trim().split(';q=');
            return {
                code: code.toLowerCase(),
                quality: qValue ? parseFloat(qValue) : 1.0,
            };
        });

        // 按质量值排序
        languages.sort((a, b) => b.quality - a.quality);

        // 查找第一个支持的语言
        for (const lang of languages) {
            if (lang.code === 'zh-cn' || lang.code === 'zh') {
                return 'zh-CN';
            }
            if (lang.code === 'en') {
                return 'en';
            }
        }

        return DEFAULT_LOCALE;
    }

    /**
     * 验证语言是否支持
     * @param locale - 语言代码
     * @returns 是否支持
     */
    isValidLocale(locale: string): locale is Locale {
        return ['zh-CN', 'en'].includes(locale);
    }
}
