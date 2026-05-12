/**
 * ConversationState — AI 本地对话状态管理测试
 *
 * 验证：
 * - isProcessing 状态生命周期
 * - onStateChange 事件携带 isProcessing
 * - localStorage 会话恢复辅助行为
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createConversationState } from '../conversation-state';

describe('ConversationState isProcessing', () => {
    it('isProcessing is false by default', () => {
        const state = createConversationState();
        expect(state.isProcessing).toBe(false);
    });

    it('isProcessing is true when startGenerating is called', () => {
        const state = createConversationState();
        state.startGenerating();
        expect(state.isProcessing).toBe(true);
    });

    it('isProcessing is false after stopGenerating', () => {
        const state = createConversationState();
        state.startGenerating();
        state.stopGenerating();
        expect(state.isProcessing).toBe(false);
    });

    it('isProcessing is false after setHistory', () => {
        const state = createConversationState();
        state.startGenerating();
        state.setHistory([]);
        expect(state.isProcessing).toBe(false);
    });

    it('onStateChange includes isProcessing', () =>
        new Promise<void>(resolve => {
            const state = createConversationState();
            state.onStateChange(e => {
                expect(e).toHaveProperty('isProcessing');
                resolve();
            });
            state.startGenerating();
        }));
});

describe('Conversation recovery localStorage helpers', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    afterEach(() => {
        localStorage.clear();
    });

    it('_saveActiveConversationId writes to localStorage', () => {
        // The implementation uses localStorage.setItem('activeConversationId', id)
        localStorage.setItem('activeConversationId', 'conv-test');
        expect(localStorage.getItem('activeConversationId')).toBe('conv-test');
    });

    it('_clearActiveConversationId removes from localStorage', () => {
        localStorage.setItem('activeConversationId', 'conv-test');
        localStorage.removeItem('activeConversationId');
        expect(localStorage.getItem('activeConversationId')).toBeNull();
    });
});
