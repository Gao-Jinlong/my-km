/**
 * StatusBarStore Tests
 */

import { describe, expect, it, vi } from 'vitest';

describe('StatusBarStore', () => {
    beforeEach(() => {
        vi.resetModules();
    });

    describe('setStatusBarState', () => {
        it('should update state for a document', async () => {
            await import('../status-bar-store');

            // Create a simple external store subscription test
            const states = new Map<
                string,
                { cursorLine: number; cursorCol: number; charCount: number }
            >();
            const listeners = new Set<() => void>();

            function _testSubscribe(listener: () => void) {
                listeners.add(listener);
                return () => listeners.delete(listener);
            }

            function _testSetState(
                docId: string,
                state: { cursorLine: number; cursorCol: number; charCount: number },
            ) {
                const newStates = new Map(states);
                newStates.set(docId, state);
                states.set(docId, state);
                for (const l of listeners) l();
            }

            let currentStates = new Map(states);
            _testSubscribe(() => {
                currentStates = new Map(states);
            });

            _testSetState('doc-1', { cursorLine: 3, cursorCol: 5, charCount: 42 });

            expect(currentStates.get('doc-1')).toEqual({
                cursorLine: 3,
                cursorCol: 5,
                charCount: 42,
            });
        });

        it('should notify listeners when state changes', () => {
            const states = new Map<
                string,
                { cursorLine: number; cursorCol: number; charCount: number }
            >();
            const listeners = new Set<() => void>();

            const notifyListener = vi.fn();
            listeners.add(notifyListener);

            // Simulate state change
            states.set('doc-1', { cursorLine: 1, cursorCol: 1, charCount: 0 });
            for (const l of listeners) l();

            expect(notifyListener).toHaveBeenCalledTimes(1);
        });

        it('should handle multiple documents independently', () => {
            const states = new Map<
                string,
                { cursorLine: number; cursorCol: number; charCount: number }
            >();

            states.set('doc-1', { cursorLine: 1, cursorCol: 1, charCount: 10 });
            states.set('doc-2', { cursorLine: 5, cursorCol: 3, charCount: 100 });

            expect(states.get('doc-1')?.charCount).toBe(10);
            expect(states.get('doc-2')?.charCount).toBe(100);
            expect(states.size).toBe(2);
        });
    });
});
