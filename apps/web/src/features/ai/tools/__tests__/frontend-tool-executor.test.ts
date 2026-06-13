import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FrontendToolExecutor } from '../frontend-tool-executor';
import type { FrontendToolHandler, ToolResult } from '../types';

function makeHandler(
    name: string,
    type: 'read' | 'write',
    result: ToolResult = { success: true },
): FrontendToolHandler {
    return {
        name,
        type,
        execute: vi.fn().mockResolvedValue(result),
        describe: () => `desc:${name}`,
    };
}

describe('FrontendToolExecutor', () => {
    let executor: FrontendToolExecutor;

    beforeEach(() => {
        executor = new FrontendToolExecutor();
    });

    it('未知工具应返回 success=false', async () => {
        const result = await executor.dispatch('unknown', {});
        expect(result.success).toBe(false);
        expect(result.error).toMatch(/Unknown tool: unknown/);
    });

    it('读工具应自动执行且不触发 confirmation', async () => {
        const handler = makeHandler('read-tool', 'read', {
            success: true,
            content: 'ok',
        });
        executor.register(handler);
        const confirmListener = vi.fn();
        executor.onConfirmationRequest(confirmListener);

        const result = await executor.dispatch('read-tool', { foo: 1 });

        expect(result).toEqual({ success: true, content: 'ok' });
        expect(handler.execute).toHaveBeenCalledWith({ foo: 1 });
        expect(confirmListener).not.toHaveBeenCalled();
    });

    it('工具执行 span 应继承 trace 并记录 tool_call 状态', async () => {
        const endedSpans: Array<{
            traceId: string;
            parentSpanId?: string;
            attributes: Record<string, unknown>;
            events: Array<{ name: string; attributes?: Record<string, unknown> }>;
        }> = [];
        const tracer = {
            startSpan: vi.fn(
                (
                    _name: string,
                    options?: {
                        traceId?: string;
                        parentSpanId?: string;
                        attributes?: Record<string, unknown>;
                    },
                ) => {
                    const span = {
                        traceId: options?.traceId ?? 'generated-trace',
                        spanId: 'tool-span-1',
                        parentSpanId: options?.parentSpanId,
                        attributes: { ...(options?.attributes ?? {}) },
                        events: [] as Array<{ name: string; attributes?: Record<string, unknown> }>,
                        setAttribute(key: string, value: unknown) {
                            this.attributes[key] = value;
                            return this;
                        },
                        addEvent(name: string, attributes?: Record<string, unknown>) {
                            this.events.push({ name, attributes });
                            return this;
                        },
                        setError(message: string) {
                            this.attributes['tool.error'] = message;
                            return this;
                        },
                        end() {
                            return {
                                spanId: this.spanId,
                                traceId: this.traceId,
                                parentSpanId: this.parentSpanId,
                                name: 'frontend.tool.execute',
                                kind: 'INTERNAL',
                                serviceName: 'test',
                                startTime: new Date().toISOString(),
                                attributes: this.attributes,
                                events: [],
                            };
                        },
                        toData() {
                            return this.end();
                        },
                    };
                    return span;
                },
            ),
            endSpan: vi.fn(span => {
                endedSpans.push(span);
                return span.toData();
            }),
            getActiveTraceparent: vi.fn(
                () => '00-0123456789abcdef0123456789abcdef-fedcba9876543210-01',
            ),
        };
        executor = new FrontendToolExecutor('bypass', tracer);
        const handler = makeHandler('read-tool', 'read', { success: true });
        executor.register(handler);

        await executor.dispatch('read-tool', { foo: 1 }, { toolCallId: 'tc-1' });

        expect(tracer.startSpan).toHaveBeenCalledWith('frontend.tool.execute', {
            traceId: '0123456789abcdef0123456789abcdef',
            parentSpanId: 'fedcba9876543210',
            attributes: {
                'tool.name': 'read-tool',
                'tool.type': 'read',
                'tool.call_id': 'tc-1',
                'tool.status': 'running',
            },
        });
        expect(endedSpans[0].attributes['tool.status']).toBe('success');
        expect(endedSpans[0].events.map(e => e.name)).toEqual([
            'tool.execution_started',
            'tool.execution_completed',
        ]);
    });

    it('写工具应触发 confirmation，approved=true 时执行', async () => {
        const handler = makeHandler('write-tool', 'write', { success: true });
        executor.register(handler);

        executor.onConfirmationRequest(req => {
            expect(req.toolName).toBe('write-tool');
            expect(req.description).toBe('desc:write-tool');
            req.resolve(true);
        });

        const result = await executor.dispatch('write-tool', { x: 1 });

        expect(result.success).toBe(true);
        expect(handler.execute).toHaveBeenCalledWith({ x: 1 });
    });

    it('写工具被拒绝时不执行 handler 并返回拒绝错误', async () => {
        const handler = makeHandler('write-tool', 'write');
        executor.register(handler);

        executor.onConfirmationRequest(req => req.resolve(false));

        const result = await executor.dispatch('write-tool', {});

        expect(result.success).toBe(false);
        expect(result.error).toMatch(/User rejected/);
        expect(handler.execute).not.toHaveBeenCalled();
    });

    it('handler 抛出异常时应捕获并返回 success=false', async () => {
        const handler: FrontendToolHandler = {
            name: 'crashy',
            type: 'read',
            execute: vi.fn().mockRejectedValue(new Error('boom')),
            describe: () => 'desc',
        };
        executor.register(handler);

        const result = await executor.dispatch('crashy', {});

        expect(result.success).toBe(false);
        expect(result.error).toMatch(/boom/);
    });

    it('同名 handler 重复注册时应覆盖', async () => {
        const h1 = makeHandler('same', 'read', { success: true, v: 1 });
        const h2 = makeHandler('same', 'read', { success: true, v: 2 });
        executor.register(h1);
        executor.register(h2);

        await expect(executor.dispatch('same', {})).resolves.toEqual({ success: true, v: 2 });
    });
});
