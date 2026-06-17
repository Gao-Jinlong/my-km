/**
 * 消息工具函数 —— 纯函数，仅依赖 @langchain/core/messages（CJS，Jest 友好）。
 *
 * 故意独立于 workflow.types.ts：后者 import @langchain/langgraph，会被
 * uuid@14 ESM 污染，无法在 Jest 下直接 import。把可测的纯函数抽到这里，
 * 让单元测试无需 mock langgraph。
 */

import type { BaseMessage } from '@langchain/core/messages';

/**
 * 判断最后一条消息是否是「带 tool_calls 的 AI 消息」，用于条件路由 tools 节点。
 *
 * 不使用 `instanceof AIMessage`：当 provider 配置了 `streaming: true`（本项目所有
 * provider 均如此）时，`chatModel.invoke()` 返回的是 `AIMessageChunk`，而
 * `AIMessageChunk` 在运行时原型链上**不是** `AIMessage` 的实例（两者是平行类，
 * 都继承自 BaseMessage），`instanceof AIMessage` 对 chunk 会误判为 false，
 * 导致 graph 直接走 END、永不进入 tools 节点、interrupt() 从不触发。
 *
 * 用 BaseMessage 的标准多态方法 `_getType()` 判断（AIMessage 和 AIMessageChunk
 * 都返回 `'ai'`），同时校验 tool_calls 数组非空。
 */
export function hasToolCalls(message: BaseMessage | undefined | null): boolean {
    if (!message) return false;
    const type = typeof message._getType === 'function' ? message._getType() : '';
    if (type !== 'ai') return false;
    // tool_calls 仅在 AIMessage / AIMessageChunk 子类声明，BaseMessage 基类无此字段，
    // 故用结构化断言访问（运行时确实存在，见 _getType 已确认为 'ai'）。
    const toolCalls = (message as { tool_calls?: unknown[] }).tool_calls;
    return Array.isArray(toolCalls) && toolCalls.length > 0;
}
