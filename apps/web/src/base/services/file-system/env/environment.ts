/**
 * 运行环境类型
 */
export type RuntimeEnvironment = 'web' | 'unknown';

/**
 * 检测当前运行环境
 */
export function detectEnvironment(): RuntimeEnvironment {
    // 浏览器环境检测
    if (typeof window !== 'undefined' && typeof document !== 'undefined') {
        return 'web';
    }

    return 'unknown';
}

/**
 * 检查是否在浏览器中
 */
export function isWeb(): boolean {
    return detectEnvironment() === 'web';
}
