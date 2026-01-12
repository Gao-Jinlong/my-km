import { CacheModule as NestCacheModule } from '@nestjs/cache-manager';
import { Global, Module } from '@nestjs/common';
//  TODO: 替换其他缓存库
import * as redisStore from 'cache-manager-ioredis-yet';
import { EnvConfig } from '../config/env.config';
import { CacheService } from './cache.service';

/**
 * 全局缓存模块
 *
 * 使用 @Global() 装饰器，使 CacheModule 在整个应用中可用
 * 无需在其他模块中重复导入
 */
@Global()
@Module({
    imports: [
        NestCacheModule.registerAsync({
            inject: [EnvConfig],
            useFactory: async (envConfig: EnvConfig) => ({
                store: redisStore,
                host: envConfig.redisHost,
                port: envConfig.redisPort,
                password: envConfig.redisPassword,
                db: envConfig.redisDb,
                ttl: envConfig.cacheTtl,
                keyPrefix: envConfig.cacheKeyPrefix,
                max: 1000, // LRU: 最多缓存 1000 个键
                isCacheable: (value: unknown) => {
                    // 不缓存 null、undefined 或错误对象
                    if (value === null || value === undefined) return false;
                    if (value instanceof Error) return false;
                    return true;
                },
            }),
        }),
    ],
    providers: [CacheService],
    exports: [NestCacheModule, CacheService],
})
export class CacheModule {}
