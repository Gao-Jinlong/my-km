/**
 * Web 端环境变量验证
 *
 * Next.js 的 NEXT_PUBLIC_ 变量在构建时注入到客户端代码中。
 * 此模块在应用启动时验证必需的环境变量，避免运行时错误。
 */

interface WebEnvConfig {
    NEXT_PUBLIC_API_URL: string;
    NEXT_PUBLIC_AI_API_URL: string;
    NEXT_PUBLIC_AI_WS_URL: string;
}

/**
 * 验证所有必需的 web 环境变量是否已设置。
 * 在开发模式下，缺失变量会抛出错误阻断启动；
 * 在生产模式下，使用 console.warn 提示。
 */
export function validateWebEnv(): WebEnvConfig {
    const required: (keyof WebEnvConfig)[] = [
        'NEXT_PUBLIC_API_URL',
        'NEXT_PUBLIC_AI_API_URL',
        'NEXT_PUBLIC_AI_WS_URL',
    ];

    const missing = required.filter(key => !process.env[key]);

    if (missing.length > 0) {
        const msg = `Missing required environment variables: ${missing.join(', ')}. Copy .env.example to .env.local and fill in the values.`;
        if (process.env.NODE_ENV === 'development') {
            throw new Error(msg);
        }
        console.warn('[web-env]', msg);
    }

    return {
        NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL ?? '',
        NEXT_PUBLIC_AI_API_URL: process.env.NEXT_PUBLIC_AI_API_URL ?? '',
        NEXT_PUBLIC_AI_WS_URL: process.env.NEXT_PUBLIC_AI_WS_URL ?? '',
    };
}
