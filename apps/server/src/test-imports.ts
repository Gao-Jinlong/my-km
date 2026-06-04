/**
 * Test Imports — 验证 AI 模块核心类可正常导入
 *
 * 旧模块（agents, workflow, tools）已删除，
 * 替换为新 Thread/Run 架构的模块导入测试。
 */

import 'reflect-metadata';

import { AiChatService } from './ai/ai.service';
import { ChatGraph } from './ai/langgraph/graphs/chat-graph';
import { RunManager } from './ai/run/run-manager';
import { ThreadService } from './ai/thread/thread.service';

console.log('AiChatService:', typeof AiChatService);
console.log('RunManager:', typeof RunManager);
console.log('ThreadService:', typeof ThreadService);
console.log('ChatGraph:', typeof ChatGraph);
