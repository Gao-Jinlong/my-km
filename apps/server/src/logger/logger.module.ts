/**
 * Logger Module
 * 全局日志模块，提供统一的日志记录服务
 * 根据 docs/technical/logging-standard.md 规范实现
 */

import { Global, Module } from '@nestjs/common';
import { LoggerService } from './logger.service';

@Global()
@Module({
    providers: [LoggerService],
    exports: [LoggerService],
})
export class LoggerModule {}
