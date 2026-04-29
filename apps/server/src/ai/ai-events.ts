/**
 * AI 模块全局事件发射器
 * 从 ai.gateway.ts 拆分出来，打破与 ai.service.ts 的循环依赖。
 */

import { EventEmitter } from 'node:events';

export const aiToolEvent = new EventEmitter();
