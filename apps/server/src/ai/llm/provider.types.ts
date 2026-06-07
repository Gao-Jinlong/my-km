/**
 * Provider 模块类型定义
 *
 * 重构(Plan A1):LLMProvider 现在暴露 LangChain `BaseChatModel` 实例,
 * 让 LangGraph 运行时通过其内置 callbacks 直接感知 LLM token chunk,
 * 并通过 `streamMode: ['messages-tuple', 'values']` 发出标准 SSE 事件,
 * 不再使用自定义 LLMOutput 流。
 */

import type { BaseChatModel } from '@langchain/core/language_models/chat_models';

/**
 * 单个 LLM 配置
 */
export interface LLMConfig {
    provider: string;
    model: string;
    temperature?: number;
    maxTokens?: number;
    apiKey?: string;
    [key: string]: unknown;
}

/**
 * 节点级 LLM 配置映射(运行时注入)
 */
export type NodeLLMConfigMap = Record<string, LLMConfig>;

/**
 * LLM Provider 工厂函数签名
 */
export type LLMProviderFactory = (config: LLMConfig) => LLMProvider;

/**
 * LLM Provider 抽象接口
 *
 * 每个 provider 持有一个 LangChain `BaseChatModel` 实例,通过 `getChatModel()`
 * 暴露给 LangGraph 节点。节点使用 `chatModel.bindTools(tools).stream(messages)`
 * 或 `.invoke(messages)`,由 LangGraph 运行时自动拦截 token chunk 并按
 * messages-tuple 协议透传给 SDK。
 */
export interface LLMProvider {
    readonly name: string;
    readonly model: string;
    /** 返回 LangChain ChatModel 实例,供 LangGraph 节点调用 */
    getChatModel(): BaseChatModel;
}
