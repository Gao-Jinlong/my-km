import type { FieldErrors } from 'react-hook-form';

/**
 * 从 Zod 错误中提取错误消息并翻译
 * @param error - Zod 错误对象
 * @param t - next-intl 的 useTranslations hook
 * @returns 翻译后的错误消息
 */
export function getZodErrorMessage(
    error: { message?: string },
    t: (key: string) => string,
): string {
    const message = error?.message || '';

    // 如果消息是翻译 key，则进行翻译
    if (message.startsWith('validation.') || message.startsWith('errors.')) {
        return t(message);
    }

    // 否则返回原始消息
    return message;
}

/**
 * 处理表单错误消息
 * @param errors - react-hook-form 的 FieldErrors 对象
 * @param t - next-intl 的 useTranslations hook
 * @returns 翻译后的错误消息字符串
 */
export function getFormErrorMessage(
    errors: FieldErrors<Record<string, unknown>>,
    fieldName: string,
    t: (key: string) => string,
): string | undefined {
    const fieldError = errors[fieldName];
    if (!fieldError) return undefined;

    if (typeof fieldError.message === 'string') {
        const message = fieldError.message;
        if (message.startsWith('validation.') || message.startsWith('errors.')) {
            return t(message);
        }
        return message;
    }

    return undefined;
}
