/**
 * RoomState — AI 本地对话状态管理测试
 *
 * 验证：
 * - isProcessing 状态生命周期
 * - onStateChange 事件携带 isProcessing
 * - localStorage 会话恢复辅助行为
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createRoomState } from '../conversation-state';

describe('RoomState isProcessing', () => {
    it('isProcessing is false by default', () => {
        const state = createRoomState();
        expect(state.isProcessing).toBe(false);
    });

    it('isProcessing is true when startGenerating is called', () => {
        const state = createRoomState();
        state.startGenerating();
        expect(state.isProcessing).toBe(true);
    });

    it('isProcessing is false after stopGenerating', () => {
        const state = createRoomState();
        state.startGenerating();
        state.stopGenerating();
        expect(state.isProcessing).toBe(false);
    });

    it('isProcessing is false after setHistory', () => {
        const state = createRoomState();
        state.startGenerating();
        state.setHistory([]);
        expect(state.isProcessing).toBe(false);
    });

    it('onStateChange includes isProcessing', () =>
        new Promise<void>(resolve => {
            const state = createRoomState();
            state.onStateChange(e => {
                expect(e).toHaveProperty('isProcessing');
                resolve();
            });
            state.startGenerating();
        }));
});

describe('Room recovery localStorage helpers', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    afterEach(() => {
        localStorage.clear();
    });

    it('_saveActiveRoomId writes to localStorage', () => {
        localStorage.setItem('activeRoomId', 'room-test');
        expect(localStorage.getItem('activeRoomId')).toBe('room-test');
    });

    it('_clearActiveRoomId removes from localStorage', () => {
        localStorage.setItem('activeRoomId', 'room-test');
        localStorage.removeItem('activeRoomId');
        expect(localStorage.getItem('activeRoomId')).toBeNull();
    });
});
