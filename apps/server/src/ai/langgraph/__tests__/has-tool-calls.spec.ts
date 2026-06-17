/**
 * hasToolCalls 单元测试
 *
 * 回归保护：这是工具调用链路的核心判断函数。
 *
 * 历史背景：条件边曾用 `instanceof AIMessage`，但所有 provider 配置了
 * `streaming: true`，`chatModel.invoke()` 返回 `AIMessageChunk`。运行时
 * `AIMessageChunk` **不是** `AIMessage` 的实例（两者平行，都继承自 BaseMessage），
 * 导致 graph 永远走 END、tools 节点与 interrupt() 从不执行。
 *
 * `hasToolCalls` 用 `_getType() === 'ai'` 多态判断，对 AIMessage 和
 * AIMessageChunk 都成立。本测试用真实的 LangChain 消息类验证这一点。
 */

import { AIMessage, AIMessageChunk, HumanMessage } from '@langchain/core/messages';
import { hasToolCalls } from '../types/message-utils';

describe('hasToolCalls', () => {
    it('returns true for AIMessage with tool_calls', () => {
        const msg = new AIMessage({
            id: 'ai-1',
            content: '',
            tool_calls: [{ id: 'tc-1', name: 'file_ops', args: { path: 'a.km' } }],
        });
        expect(hasToolCalls(msg)).toBe(true);
    });

    it('returns true for AIMessageChunk with tool_calls (streaming provider path)', () => {
        // 回归核心：AIMessageChunk 运行时不是 AIMessage 的实例，
        // 旧的 instanceof AIMessage 判断会错误返回 false。
        const msg = new AIMessageChunk({
            id: 'chunk-1',
            content: '',
            tool_calls: [{ id: 'tc-1', name: 'file_ops', args: { path: 'a.km' } }],
        });
        // 防御性断言：确认 AIMessageChunk 确实不是 AIMessage 实例（这是 bug 的前提）
        expect(msg instanceof AIMessage).toBe(false);
        expect(msg instanceof AIMessageChunk).toBe(true);
        // 修复后必须正确识别
        expect(hasToolCalls(msg)).toBe(true);
    });

    it('returns false for AIMessage without tool_calls', () => {
        const msg = new AIMessage({ id: 'ai-2', content: 'Hello' });
        expect(hasToolCalls(msg)).toBe(false);
    });

    it('returns false for AIMessageChunk without tool_calls', () => {
        const msg = new AIMessageChunk({ id: 'chunk-2', content: 'Hello' });
        expect(hasToolCalls(msg)).toBe(false);
    });

    it('returns false for AIMessage with empty tool_calls array', () => {
        const msg = new AIMessage({ id: 'ai-3', content: '', tool_calls: [] });
        expect(hasToolCalls(msg)).toBe(false);
    });

    it('returns false for non-AI message types', () => {
        const human = new HumanMessage({ content: 'hi' });
        expect(hasToolCalls(human as never)).toBe(false);
    });

    it('returns false for undefined', () => {
        expect(hasToolCalls(undefined)).toBe(false);
    });
});
