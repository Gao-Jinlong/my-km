/**
 * 确认策略系统 — 控制 LLM 编辑操作的审批流程
 *
 * 4 种策略模式：
 * - bypass: 自动通过所有操作
 * - confirm-write: 写操作需确认（默认）
 * - confirm-all: 所有操作需确认
 * - confirm-destructive: 仅破坏性操作需确认
 */

export type ConfirmationMode = 'bypass' | 'confirm-write' | 'confirm-all' | 'confirm-destructive';

export interface ConfirmationStrategy {
    readonly mode: ConfirmationMode;
    needsConfirmation(toolName: string, operation: Record<string, unknown>): boolean;
}

function isDestructiveOperation(toolName: string, input: Record<string, unknown>): boolean {
    if (toolName === 'file_ops') {
        const op = input.operation as string;
        return op === 'delete' || op === 'move';
    }
    if (toolName === 'doc_edit') {
        const opType = input.operationType as string;
        if (opType === 'delete-block') return true;
        if (opType === 'splice-text') {
            const deleteCount = input.deleteCount as number;
            return typeof deleteCount === 'number' && deleteCount > 0;
        }
    }
    return false;
}

function isWriteOperation(toolName: string, input: Record<string, unknown>): boolean {
    if (toolName === 'doc_edit') return true;
    if (toolName === 'file_ops') {
        const op = input.operation as string;
        return op !== 'list';
    }
    return false;
}

export function createConfirmationStrategy(mode: ConfirmationMode): ConfirmationStrategy {
    return {
        mode,
        needsConfirmation(toolName: string, input: Record<string, unknown>): boolean {
            switch (mode) {
                case 'bypass':
                    return false;
                case 'confirm-write':
                    return isWriteOperation(toolName, input);
                case 'confirm-all':
                    return true;
                case 'confirm-destructive':
                    return isDestructiveOperation(toolName, input);
            }
        },
    };
}
