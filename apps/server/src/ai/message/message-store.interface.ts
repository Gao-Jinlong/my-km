import type { InFlightToolCall, LLMMessage } from '../ai.types';

/**
 * MessageStore — 消息业务层接口。
 *
 * 负责：
 * - 消息格式转换（MessageRecord ↔ LLMMessage）
 * - 内存状态管理（init 加载，persist 增量更新）
 * - Token 裁剪策略
 * - Round 级事务语义编排
 *
 * 不负责：具体存储实现 — 委托给 MessageStoreProvider。
 *
 * 线程安全：所有方法接受 roomId 参数，NestJS 单例模式下可安全处理多请求并发。
 */
export interface MessageStore {
    /** 初始化：从 Provider 加载历史到内存 */
    init(roomId: string, maxTokens?: number): Promise<void>;

    /** 持久化用户消息 */
    persistUser(roomId: string, content: string): Promise<void>;

    /** 持久化助手消息（含 tool calls） */
    persistAssistant(
        roomId: string,
        content: string,
        toolCalls?: InFlightToolCall[],
    ): Promise<void>;

    /** 持久化工具结果 */
    persistToolResult(roomId: string, toolResultId: string, content: string): Promise<void>;

    /**
     * 批量持久化 round 数据
     * 一次性写入 assistant 消息 + 所有 tool results，事务语义
     */
    persistRound(
        roomId: string,
        assistantContent: string,
        toolCalls: InFlightToolCall[],
        toolResults: Record<string, unknown>,
    ): Promise<void>;

    /** 最终助手消息（无 tool calls 的场景） */
    persistFinal(roomId: string, content: string): Promise<void>;

    /** 构建 LLM 历史（从内存，O(1)） */
    buildHistory(roomId: string): LLMMessage[];

    /** 获取 token 使用量 */
    getTokenUsage(roomId: string): number;
}
