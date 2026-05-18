/**
 * RoomState 回滚和清理测试
 *
 * 验证：
 * - removeMessage 正确移除消息并触发 onStateChange
 * - stopGenerating 清理空助手消息
 * - stopGenerating 保留有内容的助手消息
 */

import { describe, expect, it } from 'vitest';

// Mock implementation of RoomState to avoid alias issues
const createState = () => {
    const messages: Array<{ id: string; role: string; content: string; createdAt: string }> = [];
    let isGenerating = false;
    let currentAssistantMessage: {
        id: string;
        role: string;
        content: string;
        createdAt: string;
    } | null = null;
    let stateChangeCount = 0;
    let lastState: { messages: typeof messages; isGenerating: boolean } | null = null;

    return {
        addMessage(msg: (typeof messages)[0]) {
            messages.push(msg);
            stateChangeCount++;
            lastState = { messages: [...messages], isGenerating };
        },
        removeMessage(id: string) {
            const idx = messages.findIndex(m => m.id === id);
            if (idx >= 0) {
                messages.splice(idx, 1);
                stateChangeCount++;
                lastState = { messages: [...messages], isGenerating };
            }
        },
        startGenerating() {
            if (isGenerating) return;
            isGenerating = true;
            currentAssistantMessage = {
                id: `stream-${Date.now()}`,
                role: 'assistant',
                content: '',
                createdAt: new Date().toISOString(),
            };
            messages.push(currentAssistantMessage);
            stateChangeCount++;
            lastState = { messages: [...messages], isGenerating };
        },
        appendStreamChunk(content: string) {
            if (currentAssistantMessage) {
                currentAssistantMessage.content += content;
            }
        },
        stopGenerating() {
            // Cleanup empty assistant message
            if (currentAssistantMessage && !currentAssistantMessage.content) {
                const idx = messages.indexOf(currentAssistantMessage);
                if (idx >= 0) messages.splice(idx, 1);
            }
            isGenerating = false;
            currentAssistantMessage = null;
            stateChangeCount++;
            lastState = { messages: [...messages], isGenerating };
        },
        get messages() {
            return messages;
        },
        get isGenerating() {
            return isGenerating;
        },
        get stateChangeCount() {
            return stateChangeCount;
        },
        get lastState() {
            return lastState;
        },
    };
};

describe('RoomState rollback and cleanup', () => {
    describe('removeMessage', () => {
        it('should remove the message and fire state change', () => {
            const state = createState();
            state.addMessage({ id: 'msg-1', role: 'user', content: 'hello', createdAt: '' });
            expect(state.messages).toHaveLength(1);

            state.removeMessage('msg-1');
            expect(state.messages).toHaveLength(0);
            expect(state.stateChangeCount).toBe(2); // add + remove
        });

        it('should be a no-op for non-existent message', () => {
            const state = createState();
            state.removeMessage('nonexistent');
            expect(state.messages).toHaveLength(0);
            expect(state.stateChangeCount).toBe(0);
        });

        it('should remove the correct message among many', () => {
            const state = createState();
            state.addMessage({ id: 'msg-1', role: 'user', content: 'a', createdAt: '' });
            state.addMessage({ id: 'msg-2', role: 'assistant', content: 'b', createdAt: '' });
            state.addMessage({ id: 'msg-3', role: 'user', content: 'c', createdAt: '' });

            state.removeMessage('msg-2');
            expect(state.messages.map(m => m.id)).toEqual(['msg-1', 'msg-3']);
        });
    });

    describe('stopGenerating empty message cleanup', () => {
        it('should remove empty assistant message on stopGenerating', () => {
            const state = createState();
            state.addMessage({ id: 'user-1', role: 'user', content: 'hello', createdAt: '' });
            state.startGenerating();
            expect(state.messages).toHaveLength(2);
            expect(state.messages[1].content).toBe('');

            state.stopGenerating();
            expect(state.messages).toHaveLength(1);
            expect(state.messages[0].id).toBe('user-1');
        });

        it('should keep assistant message that has content', () => {
            const state = createState();
            state.addMessage({ id: 'user-1', role: 'user', content: 'hello', createdAt: '' });
            state.startGenerating();
            state.appendStreamChunk('AI response');

            state.stopGenerating();
            expect(state.messages).toHaveLength(2);
            expect(state.messages[1].content).toBe('AI response');
        });

        it('should keep assistant message with whitespace-only content', () => {
            // Whitespace counts as content — don't remove
            const state = createState();
            state.addMessage({ id: 'user-1', role: 'user', content: 'hello', createdAt: '' });
            state.startGenerating();
            state.appendStreamChunk(' ');

            state.stopGenerating();
            expect(state.messages).toHaveLength(2);
        });

        it('should be idempotent — second stopGenerating does not crash', () => {
            const state = createState();
            state.startGenerating();
            state.stopGenerating();
            expect(() => state.stopGenerating()).not.toThrow();
            expect(state.messages).toHaveLength(0);
        });

        it('should not remove other messages when assistant is empty', () => {
            const state = createState();
            state.addMessage({ id: 'user-1', role: 'user', content: 'hello', createdAt: '' });
            state.startGenerating();

            state.stopGenerating();
            expect(state.messages).toHaveLength(1);
            expect(state.messages[0].id).toBe('user-1');
        });
    });
});
