import { describe, expect, it } from 'vitest';
import { createConfirmationStrategy, type ConfirmationMode } from '../confirmation-strategy';

describe('ConfirmationStrategy', () => {
    const modes: ConfirmationMode[] = ['bypass', 'confirm-write', 'confirm-all', 'confirm-destructive'];

    it('每个模式都能创建策略实例', () => {
        for (const mode of modes) {
            const strategy = createConfirmationStrategy(mode);
            expect(strategy.mode).toBe(mode);
        }
    });

    describe('bypass 模式', () => {
        const strategy = createConfirmationStrategy('bypass');

        it('所有操作都不需要确认', () => {
            expect(strategy.needsConfirmation('file_ops', { operation: 'delete' })).toBe(false);
            expect(strategy.needsConfirmation('doc_edit', { operationType: 'splice-text' })).toBe(false);
            expect(strategy.needsConfirmation('doc_read', {})).toBe(false);
        });
    });

    describe('confirm-write 模式', () => {
        const strategy = createConfirmationStrategy('confirm-write');

        it('读操作不需要确认', () => {
            expect(strategy.needsConfirmation('doc_read', {})).toBe(false);
            expect(strategy.needsConfirmation('file_ops', { operation: 'list' })).toBe(false);
            expect(strategy.needsConfirmation('search', {})).toBe(false);
        });

        it('写操作需要确认', () => {
            expect(strategy.needsConfirmation('file_ops', { operation: 'create' })).toBe(true);
            expect(strategy.needsConfirmation('file_ops', { operation: 'delete' })).toBe(true);
            expect(strategy.needsConfirmation('doc_edit', { operationType: 'splice-text' })).toBe(true);
            expect(strategy.needsConfirmation('doc_edit', { operationType: 'insert-text' })).toBe(true);
        });
    });

    describe('confirm-all 模式', () => {
        const strategy = createConfirmationStrategy('confirm-all');

        it('所有操作都需要确认', () => {
            expect(strategy.needsConfirmation('doc_read', {})).toBe(true);
            expect(strategy.needsConfirmation('file_ops', { operation: 'list' })).toBe(true);
            expect(strategy.needsConfirmation('doc_edit', { operationType: 'insert-text' })).toBe(true);
        });
    });

    describe('confirm-destructive 模式', () => {
        const strategy = createConfirmationStrategy('confirm-destructive');

        it('非破坏性写操作不需要确认', () => {
            expect(strategy.needsConfirmation('doc_read', {})).toBe(false);
            expect(strategy.needsConfirmation('file_ops', { operation: 'list' })).toBe(false);
            expect(strategy.needsConfirmation('file_ops', { operation: 'create' })).toBe(false);
            expect(strategy.needsConfirmation('doc_edit', { operationType: 'insert-text' })).toBe(false);
            expect(strategy.needsConfirmation('doc_edit', { operationType: 'insert-block' })).toBe(false);
        });

        it('破坏性操作需要确认', () => {
            expect(strategy.needsConfirmation('file_ops', { operation: 'delete' })).toBe(true);
            expect(strategy.needsConfirmation('file_ops', { operation: 'move' })).toBe(true);
            expect(strategy.needsConfirmation('doc_edit', { operationType: 'delete-block' })).toBe(true);
            expect(strategy.needsConfirmation('doc_edit', { operationType: 'splice-text', deleteCount: 5 })).toBe(true);
        });

        it('splice-text deleteCount=0 不算破坏性', () => {
            expect(strategy.needsConfirmation('doc_edit', { operationType: 'splice-text', deleteCount: 0 })).toBe(false);
        });
    });
});
