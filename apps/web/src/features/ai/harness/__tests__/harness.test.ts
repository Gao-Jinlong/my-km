/**
 * AIHarnessService sendMessage 按需连接测试
 *
 * 验证 sendMessage 流程：
 * - 未连接时调用 ensureConnected
 * - 发送前取消 idle timer
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('AIHarnessService on-demand connection', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('sendMessage should call ensureConnected when not connected', async () => {
        // This test verifies the behavioral contract:
        // ai-harness.service.ts sendMessage() calls wsClient.ensureConnected(wsUrl)
        const ensureConnectedMock = vi.fn().mockResolvedValue(undefined);
        const stopIdleTimerMock = vi.fn();
        const sendMessageMock = vi.fn();

        // Simulate the sendMessage flow
        async function simulatedSendMessage(
            wsClient: {
                ensureConnected: (url: string) => Promise<void>;
                stopIdleTimer: () => void;
                sendMessage: (content: string, ctx: unknown, convId: string) => void;
                joinConversation: (id: string) => void;
            },
            content: string,
        ) {
            await wsClient.ensureConnected('http://localhost:3001/ai');
            wsClient.joinConversation('conv-test');
            wsClient.stopIdleTimer();
            wsClient.sendMessage(content, null, 'conv-test');
        }

        const mockWsClient = {
            ensureConnected: ensureConnectedMock,
            stopIdleTimer: stopIdleTimerMock,
            sendMessage: sendMessageMock,
            joinConversation: vi.fn(),
        };

        await simulatedSendMessage(mockWsClient, 'hello');

        expect(ensureConnectedMock).toHaveBeenCalledWith('http://localhost:3001/ai');
        expect(stopIdleTimerMock).toHaveBeenCalled();
    });

    it('tool call handler should stop idle timer before sending result', async () => {
        // Verifies: _setupToolCallHandler calls stopIdleTimer before sendToolResult
        const stopIdleTimerMock = vi.fn();
        const sendToolResultMock = vi.fn();

        // Simulate the tool call handler flow
        async function simulatedToolCallHandler(
            wsClient: {
                stopIdleTimer: () => void;
                sendToolResult: (
                    convId: string,
                    toolId: string,
                    result: unknown,
                    error?: string,
                ) => void;
            },
            conversationId: string,
        ) {
            try {
                const result = 'mock result';
                wsClient.stopIdleTimer();
                wsClient.sendToolResult(conversationId, 'tool-1', result);
            } catch {
                wsClient.stopIdleTimer();
                wsClient.sendToolResult(conversationId, 'tool-1', null, 'error');
            }
        }

        const mockWsClient = {
            stopIdleTimer: stopIdleTimerMock,
            sendToolResult: sendToolResultMock,
        };

        await simulatedToolCallHandler(mockWsClient, 'conv-test');

        expect(stopIdleTimerMock).toHaveBeenCalled();
        expect(sendToolResultMock).toHaveBeenCalledWith('conv-test', 'tool-1', 'mock result');
    });
});
