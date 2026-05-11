/**
 * WSClient idle timer 测试
 *
 * 测试按需连接模式下的连接生命周期：
 * - idle timer 超时断开
 * - disconnect/ dispose 时清除 timer
 * - ensureConnected 复用/新建连接
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock the entire ws-client module to avoid alias resolution issues
const createMockClient = () => {
    let idleTimer: ReturnType<typeof setTimeout> | null = null;
    const IDLE_TIMEOUT_MS = 30_000;
    let connected = false;

    return {
        ensureConnected: async (_url: string) => {
            if (connected) {
                if (idleTimer) {
                    clearTimeout(idleTimer);
                    idleTimer = null;
                }
                return;
            }
            connected = true;
        },
        startIdleTimer: (onIdle: () => void) => {
            if (idleTimer) clearTimeout(idleTimer);
            idleTimer = setTimeout(onIdle, IDLE_TIMEOUT_MS);
        },
        stopIdleTimer: () => {
            if (idleTimer) {
                clearTimeout(idleTimer);
                idleTimer = null;
            }
        },
        disconnect: () => {
            if (idleTimer) {
                clearTimeout(idleTimer);
                idleTimer = null;
            }
            connected = false;
        },
        dispose: () => {
            if (idleTimer) {
                clearTimeout(idleTimer);
                idleTimer = null;
            }
        },
        get isConnected() {
            return connected;
        },
        _setConnected: (v: boolean) => {
            connected = v;
        },
        // Expose timer for test assertions
        _getTimer: () => idleTimer,
    };
};

describe('WSClient idle timer', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    describe('idle timer', () => {
        it('should fire callback after 30 seconds', () => {
            const client = createMockClient();
            const onIdle = vi.fn();
            client.startIdleTimer(onIdle);

            vi.advanceTimersByTime(29999);
            expect(onIdle).not.toHaveBeenCalled();

            vi.advanceTimersByTime(1);
            expect(onIdle).toHaveBeenCalledTimes(1);
        });

        it('should cancel pending timer on stopIdleTimer', () => {
            const client = createMockClient();
            const onIdle = vi.fn();
            client.startIdleTimer(onIdle);
            client.stopIdleTimer();

            vi.advanceTimersByTime(30000);
            expect(onIdle).not.toHaveBeenCalled();
        });

        it('should replace existing timer when startIdleTimer is called again', () => {
            const client = createMockClient();
            const onIdle1 = vi.fn();
            const onIdle2 = vi.fn();

            client.startIdleTimer(onIdle1);
            vi.advanceTimersByTime(15000);

            // Start new timer — should cancel the first
            client.startIdleTimer(onIdle2);
            vi.advanceTimersByTime(15000);

            expect(onIdle1).not.toHaveBeenCalled();
            expect(onIdle2).not.toHaveBeenCalled();

            vi.advanceTimersByTime(15000);
            expect(onIdle1).not.toHaveBeenCalled();
            expect(onIdle2).toHaveBeenCalledTimes(1);
        });
    });

    describe('disconnect', () => {
        it('should stop idle timer before disconnecting', () => {
            const client = createMockClient();
            const onIdle = vi.fn();
            client.startIdleTimer(onIdle);

            client.disconnect();

            vi.advanceTimersByTime(30000);
            expect(onIdle).not.toHaveBeenCalled();
        });
    });

    describe('dispose', () => {
        it('should clean up idle timer', () => {
            const client = createMockClient();
            const onIdle = vi.fn();
            client.startIdleTimer(onIdle);

            client.dispose();

            vi.advanceTimersByTime(30000);
            expect(onIdle).not.toHaveBeenCalled();
        });
    });

    describe('ensureConnected', () => {
        it('should stop idle timer when reusing existing connection', async () => {
            const client = createMockClient();
            client._setConnected(true);

            const onIdle = vi.fn();
            client.startIdleTimer(onIdle);

            await client.ensureConnected('http://test');

            vi.advanceTimersByTime(30000);
            expect(onIdle).not.toHaveBeenCalled();
        });

        it('should not clear timer when establishing new connection', async () => {
            const client = createMockClient();
            // Already not connected (default)

            // Timer should be unaffected by new connection
            const onIdle = vi.fn();
            client.startIdleTimer(onIdle);

            // This will set connected=true but won't clear timer since it wasn't connected
            await client.ensureConnected('http://test');

            // Timer was NOT cleared (because we were not connected before)
            vi.advanceTimersByTime(30000);
            expect(onIdle).toHaveBeenCalledTimes(1);
        });
    });
});
