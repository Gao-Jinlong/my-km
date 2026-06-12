import { Emitter, type Event } from '@/base/common/event';
import type { ConfirmationRequest, FrontendToolHandler, ToolResult } from './types';

/**
 * FrontendToolExecutor
 *
 * 负责：
 * 1. 注册前端工具 handler
 * 2. 接收 interrupt 触发的工具调用，按 read/write 分流：
 *    - read：直接执行
 *    - write：触发 onConfirmationRequest 事件，等待 UI resolve 后再执行
 * 3. 把执行结果作为 ToolResult 返回给调用方（再由调用方 resumeWithToolResult）
 *
 * 不直接处理 SSE/interrupt 协议；由消费方（AIPanel）订阅 interrupt 并调用 dispatch。
 */
export class FrontendToolExecutor {
    private readonly handlers = new Map<string, FrontendToolHandler>();
    private readonly _onConfirmationRequest = new Emitter<ConfirmationRequest>();
    readonly onConfirmationRequest: Event<ConfirmationRequest> = this._onConfirmationRequest.event;

    register(handler: FrontendToolHandler): void {
        this.handlers.set(handler.name, handler);
    }

    async dispatch(toolName: string, input: Record<string, unknown>): Promise<ToolResult> {
        const handler = this.handlers.get(toolName);
        if (!handler) {
            return { success: false, error: `Unknown tool: ${toolName}` };
        }

        try {
            if (handler.type === 'read') {
                return await handler.execute(input);
            }

            const approved = await this.requestConfirmation(handler, input);
            if (!approved) {
                return { success: false, error: 'User rejected the operation' };
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
