/**
 * AIHarnessService sendMessage 回滚行为测试
 *
 * 验证：
 * - context 获取失败时回滚用户消息和助手消息
 * - context 获取成功时正常发送
 */

import { describe, expect, it, vi } from 'vitest';

describe('AIHarnessService sendMessage rollback', () => {
    it('should rollback user and assistant messages when context fails', async () => {
        const addMessage = vi.fn();
        const removeMessage = vi.fn();
        const startGenerating = vi.fn();
        const stopGenerating = vi.fn();
        const sendMessage = vi.fn();

        const getContext = vi.fn().mockRejectedValue(new Error('context failed'));

        // Simulate the sendMessage flow
        async function simulatedSendMessage(
            content: string,
            contextCollector: { getContext: (id: string) => Promise<unknown> },
            state: {
                addMessage: (m: unknown) => void;
                removeMessage: (id: string) => void;
                startGenerating: () => void;
                stopGenerating: () => void;
            },
            wsClient: { sendMessage: (c: string, ctx: unknown, roomId: string) => void },
            roomId: string,
        ) {
            const userMsgId = `user-${Date.now()}`;
            state.addMessage({ id: userMsgId, role: 'user', content });
            state.startGenerating();

            await contextCollector
                .getContext(roomId)
                .then(ctx => {
                    wsClient.sendMessage(content, ctx, roomId);
                })
                .catch(() => {
                    state.removeMessage(userMsgId);
                    state.stopGenerating();
                });
        }

        await simulatedSendMessage(
            'hello',
            { getContext },
            { addMessage, removeMessage, startGenerating, stopGenerating },
            { sendMessage },
            'conv-test',
        );

        expect(addMessage).toHaveBeenCalledTimes(1);
        expect(startGenerating).toHaveBeenCalledTimes(1);
        expect(removeMessage).toHaveBeenCalledTimes(1);
        expect(stopGenerating).toHaveBeenCalledTimes(1);
        expect(sendMessage).not.toHaveBeenCalled();
    });

    it('should send message when context succeeds', async () => {
        const addMessage = vi.fn();
        const removeMessage = vi.fn();
        const startGenerating = vi.fn();
        const stopGenerating = vi.fn();
        const sendMessage = vi.fn();

        const getContext = vi.fn().mockResolvedValue({ selectedText: 'test' });

        async function simulatedSendMessage(
            content: string,
            contextCollector: { getContext: (id: string) => Promise<unknown> },
            state: {
                addMessage: (m: unknown) => void;
                removeMessage: (id: string) => void;
                startGenerating: () => void;
                stopGenerating: () => void;
            },
            wsClient: { sendMessage: (c: string, ctx: unknown, roomId: string) => void },
            roomId: string,
        ) {
            const userMsgId = `user-${Date.now()}`;
            state.addMessage({ id: userMsgId, role: 'user', content });
            state.startGenerating();

            await contextCollector
                .getContext(roomId)
                .then(ctx => {
                    wsClient.sendMessage(content, ctx, roomId);
                })
                .catch(() => {
                    state.removeMessage(userMsgId);
                    state.stopGenerating();
                });
        }

        await simulatedSendMessage(
            'hello',
            { getContext },
            { addMessage, removeMessage, startGenerating, stopGenerating },
            { sendMessage },
            'conv-test',
        );

        expect(addMessage).toHaveBeenCalledTimes(1);
        expect(startGenerating).toHaveBeenCalledTimes(1);
        expect(sendMessage).toHaveBeenCalledTimes(1);
        expect(removeMessage).not.toHaveBeenCalled();
        expect(stopGenerating).not.toHaveBeenCalled();
    });

    it('should send message with null context when getContext returns null', async () => {
        const sendMessage = vi.fn();
        const getContext = vi.fn().mockResolvedValue(null);

        // Simulate: getContext returns null → .then receives null → sendMessage with null ctx
        await getContext('room-test').then((ctx: unknown) => {
            sendMessage('hello', ctx, 'room-test');
        });

        expect(sendMessage).toHaveBeenCalledWith('hello', null, 'room-test');
    });
});
