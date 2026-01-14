import { Inject, Injectable, Logger } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { CacheKeyPrefix, CacheTTL } from './cache.constants';

/**
 * 缓存服务
 *
 * 提供类型安全的缓存操作方法
 * 支持自动序列化/反序列化 JSON 对象
 */
@Injectable()
export class CacheService {
    private readonly logger = new Logger(CacheService.name);

    constructor(@Inject(CACHE_MANAGER) private cacheManager: Cache) {}

    /**
     * Check if value is cacheable
     * Replaces cache-manager-ioredis-yet's isCacheable option
     */
    private isCacheable(value: unknown): boolean {
        if (value === null || value === undefined) return false;
        if (value instanceof Error) return false;
        return true;
    }

    /**
     * 获取缓存值
     */
    async get<T>(key: string): Promise<T | undefined> {
        try {
            const value = await this.cacheManager.get<T>(key);
            if (value !== undefined && value !== null) {
                this.logger.debug(`Cache hit: ${key}`);
                return value;
            }
            this.logger.debug(`Cache miss: ${key}`);
            return undefined;
        } catch (error) {
            this.logger.error(`Cache get error: ${key}`, error);
            return undefined;
        }
    }

    /**
     * 设置缓存值
     */
    async set<T>(key: string, value: T, ttl?: number): Promise<void> {
        try {
            // Apply isCacheable filter (moved from store to service)
            if (!this.isCacheable(value)) {
                this.logger.debug(`Value not cacheable, skipping: ${key}`);
                return;
            }

            await this.cacheManager.set(key, value, ttl);
            this.logger.debug(`Cache set: ${key} (TTL: ${ttl || 'default'})`);
        } catch (error) {
            this.logger.error(`Cache set error: ${key}`, error);
        }
    }

    /**
     * 删除缓存
     */
    async del(key: string): Promise<void> {
        try {
            await this.cacheManager.del(key);
            this.logger.debug(`Cache deleted: ${key}`);
        } catch (error) {
            this.logger.error(`Cache delete error: ${key}`, error);
        }
    }

    /**
     * 清空所有缓存
     */
    async reset(): Promise<void> {
        try {
            // Handle cache-manager v6+ stores array
            const cache = this.cacheManager as any;
            if (cache.stores && Array.isArray(cache.stores)) {
                await Promise.all(
                    cache.stores.map((store: unknown) => {
                        // Keyv stores use .clear() instead of .reset()
                        if (store && typeof store === 'object' && 'clear' in store) {
                            return (store as { clear: () => Promise<void> }).clear();
                        }
                        return Promise.resolve();
                    }),
                );
            } else if (cache.store?.reset) {
                await cache.store.reset();
            } else if (cache.cache) {
                await cache.cache.reset();
            }
            this.logger.warn('Cache reset');
        } catch (error) {
            this.logger.error('Cache reset error', error);
        }
    }

    /**
     * 生成用户缓存键
     */
    getUserKey(userId: string): string {
        return `${CacheKeyPrefix.USER}${userId}`;
    }

    /**
     * 生成用户邮箱缓存键
     */
    getUserByEmailKey(email: string): string {
        return `${CacheKeyPrefix.USER_BY_EMAIL}${email.toLowerCase()}`;
    }

    /**
     * 生成会话缓存键
     */
    getSessionKey(sessionId: string): string {
        return `${CacheKeyPrefix.USER_SESSION}${sessionId}`;
    }
}
