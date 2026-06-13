import { Emitter, type Event } from '@/base/common/event';
import { getContainer } from '@/platform/bootstrap';
import { TracingService } from '@/platform/tracing';
import type { ITracingService, SpanOptions } from '@/platform/tracing/types';
import {
    type ConfirmationMode,
    type ConfirmationStrategy,
    createConfirmationStrategy,
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
export interface ToolDispatchOptions {
    toolCallId?: string;
}

export interface ToolTracingService
    extends Pick<ITracingService, 'startSpan' | 'endSpan' | 'getActiveTraceparent'> {}

export class FrontendToolExecutor {
    private readonly handlers = new Map<string, FrontendToolHandler>();
    private readonly _onConfirmationRequest = new Emitter<ConfirmationRequest>();
    readonly onConfirmationRequest: Event<ConfirmationRequest> = this._onConfirmationRequest.event;

    private strategy: ConfirmationStrategy;

    constructor(
        mode: ConfirmationMode = 'confirm-write',
        private readonly tracer?: ToolTracingService,
    ) {
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

    async dispatch(
        toolName: string,
        input: Record<string, unknown>,
        options?: ToolDispatchOptions,
    ): Promise<ToolResult> {
        const handler = this.handlers.get(toolName);
        if (!handler) {
            return { success: false, error: `Unknown tool: ${toolName}` };
        }

        const tracer = this.tracer ?? getContainer().get(TracingService);
        const traceContext = parseTraceparent(tracer.getActiveTraceparent());
        const spanOptions: SpanOptions = {
            traceId: traceContext?.traceId,
            parentSpanId: traceContext?.parentSpanId,
            attributes: {
                'tool.name': toolName,
                'tool.type': handler.type,
                'tool.status': 'running',
            },
        };
        if (options?.toolCallId) {
            spanOptions.attributes = {
                ...spanOptions.attributes,
                'tool.call_id': options.toolCallId,
            };
        }
        const toolSpan = tracer.startSpan('frontend.tool.execute', spanOptions);
        toolSpan.addEvent('tool.execution_started');

        try {
            if (handler.type === 'write' || this.strategy.needsConfirmation(toolName, input)) {
                const approved = await this.requestConfirmation(handler, input);
                if (!approved) {
                    toolSpan.setAttribute('tool.status', 'rejected');
                    toolSpan.setError('User rejected the operation');
                    tracer.endSpan(toolSpan);
                    return { success: false, error: 'User rejected the operation' };
                }
            }

            const result = await handler.execute(input);
            if (!result.success) {
                toolSpan.setAttribute('tool.status', 'error');
                toolSpan.setError(result.error ?? 'Tool execution failed');
            } else {
                toolSpan.setAttribute('tool.status', 'success');
            }
            toolSpan.addEvent('tool.execution_completed');
            tracer.endSpan(toolSpan);
            return result;
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            toolSpan.setAttribute('tool.status', 'error');
            toolSpan.setError(message);
            tracer.endSpan(toolSpan);
            return {
                success: false,
                error: message,
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

function parseTraceparent(
    traceparent: string | null,
): { traceId: string; parentSpanId: string } | null {
    if (!traceparent) return null;
    const parts = traceparent.split('-');
    if (parts.length !== 4) return null;
    const [, traceId, parentSpanId] = parts;
    if (!/^[a-f0-9]{32}$/.test(traceId) || !/^[a-f0-9]{16}$/.test(parentSpanId)) {
        return null;
    }
    return { traceId, parentSpanId };
}
