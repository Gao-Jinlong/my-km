/**
 * 缓存常量
 */

/**
 * 缓存键前缀常量
 */
export class CacheKeyPrefix {
    static readonly USER = 'user:';
    static readonly USER_BY_EMAIL = 'user:email:';
    static readonly USER_SESSION = 'session:';
}

/**
 * 缓存 TTL 常量（秒）
 */
export class CacheTTL {
    static readonly USER = 300;        // 5 分钟
    static readonly USER_EMAIL = 300;  // 5 分钟
    static readonly SESSION = 1800;    // 30 分钟
}

/**
 * 缓存配置选项
 */
export const CACHE_OPTIONS = {
    ttl: 300,              // 默认 TTL: 5 分钟
    max: 1000,             // LRU: 最多缓存 1000 个键
    isCacheable: (value: unknown) => {
        // 不缓存 null、undefined 或错误对象
        if (value === null || value === undefined) return false;
        if (value instanceof Error) return false;
        return true;
    },
} as const;
