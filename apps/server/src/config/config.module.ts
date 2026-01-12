/**
 * 配置模块
 * 全局模块，提供环境变量配置服务
 *
 * 使用 @Global() 装饰器，无需在其他模块中重复导入
 */

import { Global, Module } from '@nestjs/common';
import { EnvConfig } from './env.config';

@Global()
@Module({
    providers: [EnvConfig],
    exports: [EnvConfig],
})
export class ConfigModule {}
