import KeyvRedis from '@keyv/redis';
import { CacheModule as NestCacheModule } from '@nestjs/cache-manager';
import { Global, Module } from '@nestjs/common';
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
                stores: [new KeyvRedis(envConfig.redisUrl)],
            }),
        }),
    ],
    providers: [CacheService],
    exports: [NestCacheModule, CacheService],
})
export class CacheModule {}
