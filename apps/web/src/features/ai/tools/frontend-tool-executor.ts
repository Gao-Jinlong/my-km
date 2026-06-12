import { Emitter, type Event } from '@/base/common/event';
import {
    createConfirmationStrategy,
    type ConfirmationMode,
    type ConfirmationStrategy,
} from './confirmation-strategy';
import type { ConfirmationRequest, FrontendToolHandler, ToolResult } from './types';

/**
 * FrontendToolExecutor
 *
 * 负责：
 * 1. 注册前端工具 handler
 * 2. 根据确认策略决定是否需要用户确认：
 *    - bypass: 所有操作自动执行
 *    - confirm-write: 写操作需确认（默认）
 *    - confirm-all: 所有操作需确认
 *    - confirm-destructive: 仅破坏性操作需确认
 * 3. 把执行结果作为 ToolResult 返回给调用方（再由调用方 resumeWithToolResult）
 */
export class FrontendToolExecutor {
    private readonly handlers = new Map<string, FrontendToolHandler>();
    private readonly _onConfirmationRequest = new Emitter<ConfirmationRequest>();
    readonly onConfirmationRequest: Event<ConfirmationRequest> = this._onConfirmationRequest.event;

    private strategy: ConfirmationStrategy;

    constructor(mode: ConfirmationMode = 'confirm-write') {
        this.strategy = createConfirmationStrategy(mode);
    }

    /** 切换确认策略模式 */
    setStrategy(mode: ConfirmationMode): void {
        this.strategy = createConfirmationStrategy(mode);
    }

    /** 获取当前策略模式 */
    getStrategyMode(): ConfirmationMode {
        return this.strategy.mode;
    }

    register(handler: FrontendToolHandler): void {
        this.handlers.set(handler.name, handler);
    }

    async dispatch(toolName: string, input: Record<string, unknown>): Promise<ToolResult> {
        const handler = this.handlers.get(toolName);
        if (!handler) {
            return { success: false, error: `Unknown tool: ${toolName}` };
        }

        try {
            if (this.strategy.needsConfirmation(toolName, input)) {
                const approved = await this.requestConfirmation(handler, input);
                if (!approved) {
                    return { success: false, error: 'User rejected the operation' };
                }
            }
            return await handler.execute(input);
        } catch (err) {
            return {
                success: false,
                error: err instanceof Error ? err.message : String(err),
            };
        }
    }

    private requestConfirmation(
        handler: FrontendToolHandler,
        input: Record<string, unknown>,
    ): Promise<boolean> {
        return new Promise(resolve => {
            this._onConfirmationRequest.fire({
                toolName: handler.name,
                input,
                description: handler.describe(input),
                resolve,
            });
        });
    }

    dispose(): void {
        this._onConfirmationRequest.dispose();
        this.handlers.clear();
    }
}
