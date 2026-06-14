/**
 * useLangGraphStream — 用 @langchain/langgraph-sdk 的 useStream 封装 AI 对话
 *
 * 提供与 useAIThread 兼容的接口，供 AIPanel 使用。
 *
 * 后端 LangGraph 协议兼容端点：
 *   POST /api/threads/:tid/runs/stream
 *     新 run:    { input: { messages: [...] }, assistant_id: 'default' }
 *     resume:    { input: null, command: { resume: ... }, assistant_id: 'default' }
 *
 * SSE 事件流：
 *   metadata → messages/partial*(逐 token) → values → end（或 error）
 */

import type { Message } from '@langchain/langgraph-sdk';
import { useStream } from '@langchain/langgraph-sdk/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createLangGraphClient, withTraceparent } from '@/features/ai/sdk/langgraph-client';
import { getContainer } from '@/platform/bootstrap';
import { type ActiveSpan, type TraceContext, TracingService } from '@/platform/tracing';

type TraceEventSpan = Pick<ActiveSpan, 'addEvent'>;

/**
 * 与 useAIThread 兼容的消息格式
 *
 * toolCalls 和 toolCallId 用于向下兼容 toMessageWire 格式。
 * SDK 的消息格式会通过 content 和 id 传递工具调用信息。
 */
export interface ChatMessage {
    id: string;
    role: 'human' | 'ai';
    content: string;
    timestamp?: number;
    toolCalls?: Array<{ id: string; name: string }>;
    toolCallId?: string;
}

/**
 * 工具中断信息
 */
export interface ToolInterrupt {
    toolCallId: string;
    toolName: string;
    input: Record<string, unknown>;
}

/**
 * useLangGraphStream 返回值 — 与 useAIThread 接口兼容
 */
export interface UseLangGraphStreamReturn {
    messages: ChatMessage[];
    isStreaming: boolean;
    /** AI 正在流式生成（最后一条消息仍在追加 token） */
    isLastMessageStreaming: boolean;
    error: string | null;
    threadId: string | null;
    runId: string | null;
    interrupt: ToolInterrupt | null;
    sendMessage: (content: string, context?: Record<string, unknown>) => Promise<void>;
    resumeWithToolResult: (toolCallId: string, result: unknown) => Promise<void>;
    stop: () => Promise<void>;
    /** 当前活跃 trace 上下文（供下游消费者创建子 span） */
    traceContext: TraceContext | null;
}

/**
 * 判断消息是否应在 UI 中隐藏
 *
 * 后端通过 `additional_kwargs.hide_from_ui = true` 标记系统自动注入的消息
 * （如 editor context SystemMessage），这些消息会持久化到 checkpoint
 * 供 LLM 使用，但不应展示给用户。
 */
function isHiddenFromUI(msg: Message): boolean {
    const kwargs = (msg as { additional_kwargs?: Record<string, unknown> }).additional_kwargs;
    return kwargs?.hide_from_ui === true;
}

/**
 * 将 SDK Message 转换为内部 ChatMessage 格式
 *
 * 返回 null 表示该消息不应展示（如 system 消息）。
 */
export function toChatMessageForTest(msg: Message): ChatMessage | null {
    return toChatMessage(msg);
}

function toChatMessage(msg: Message): ChatMessage | null {
    // system 消息不在对话流中展示（防御性处理，正常情况下已被 isHiddenFromUI 过滤）
    if (msg.type === 'system') {
        return null;
    }

    const role = msg.type === 'human' ? 'human' : 'ai';
    const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);

    // 提取 AI 消息的 tool_calls（用于 toMessageWire 兼容）
    const toolCalls =
        msg.type === 'ai' && Array.isArray((msg as { tool_calls?: unknown }).tool_calls)
            ? (msg as { tool_calls: Array<{ id: string; name: string }> }).tool_calls.map(tc => ({
                  id: tc.id,
                  name: tc.name,
              }))
            : undefined;

    // tool 消息的 tool_call_id
    const toolCallId =
        msg.type === 'tool' && typeof (msg as { tool_call_id?: unknown }).tool_call_id === 'string'
            ? (msg as { tool_call_id: string }).tool_call_id
            : undefined;

    return {
        id: msg.id ?? `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        role,
        content,
        timestamp: Date.now(),
        toolCalls,
        toolCallId,
    };
}

/**
 * 从 SDK Interrupt 中提取工具调用信息
 */
export function recordToolCallEvents(
    span: TraceEventSpan | null,
    messages: Array<ChatMessage | null>,
    seenToolCallIds: Set<string>,
): void {
    if (!span) return;

    for (const message of messages) {
        if (!message?.toolCalls?.length) continue;
        for (const toolCall of message.toolCalls) {
            if (seenToolCallIds.has(toolCall.id)) continue;
            seenToolCallIds.add(toolCall.id);
            span.addEvent('tool_call_received', {
                'tool.call_id': toolCall.id,
                'tool.name': toolCall.name,
                messageId: message.id,
            });
        }
    }
}

export function recordToolInterruptEvent(
    span: TraceEventSpan | null,
    interrupt: ToolInterrupt | null,
    seenToolCallIds: Set<string>,
): void {
    if (!span || !interrupt || seenToolCallIds.has(interrupt.toolCallId)) return;
    seenToolCallIds.add(interrupt.toolCallId);
    span.addEvent('tool_call_interrupt_received', {
        'tool.call_id': interrupt.toolCallId,
        'tool.name': interrupt.toolName,
    });
}

function extractInterrupt(interrupt: unknown): ToolInterrupt | null {
    if (!interrupt || typeof interrupt !== 'object') return null;

    // LangGraph Interrupt 格式: { value: { tool_call_id?, tool_name?, args? }, id?, ... }
    const obj = interrupt as Record<string, unknown>;
    const value = (obj.value ?? {}) as Record<string, unknown>;

    const toolCallId =
        (typeof value.tool_call_id === 'string' && value.tool_call_id) ||
        (typeof obj.id === 'string' && obj.id) ||
        `tool-${Date.now()}`;

    const toolName =
        (typeof value.tool_name === 'string' && value.tool_name) ||
        (typeof value.name === 'string' && value.name) ||
        'unknown_tool';

    const input =
        (value.args as Record<string, unknown>) || (value.input as Record<string, unknown>) || {};

    return { toolCallId, toolName, input };
}

export function useLangGraphStream(): UseLangGraphStreamReturn {
    const [threadId, setThreadId] = useState<string | null>(null);
    const [runId, setRunId] = useState<string | null>(null);
    const activeTraceSpan = useRef<ActiveSpan | null>(null);
    const activeTraceId = useRef<string | null>(null);
    const hasSeenFirstMessageChunk = useRef(false);
    const seenMessageToolCallIds = useRef(new Set<string>());
    const seenInterruptToolCallIds = useRef(new Set<string>());
    const threadTraceIds = useRef<Map<string, string>>(new Map());
    const pendingTraceId = useRef<string | null>(null);
    const traceparentRef = useRef<string | null>(null);

    const client = useMemo(
        () =>
            createLangGraphClient({
                onRequest: withTraceparent(() => traceparentRef.current),
            }),
        [],
    );

    const stream = useStream<{ messages: Message[] }>({
        client,
        assistantId: 'default',
        threadId,
        messagesKey: 'messages',
        onThreadId: id => {
            // Persist pending traceId when the thread is first created
            if (pendingTraceId.current && !threadTraceIds.current.has(id)) {
                threadTraceIds.current.set(id, pendingTraceId.current);
                pendingTraceId.current = null;
            }
            activeTraceSpan.current?.addEvent('metadata_received', { threadId: id });
            setThreadId(id);
        },
        onCreated: info => {
            activeTraceSpan.current?.addEvent('metadata_received', { runId: info.run_id ?? null });
            setRunId(info.run_id ?? null);
        },
    });

    // ========== rAF 节流 ==========
    // SDK 每次 messages/partial 事件都更新 stream.messages，
    // 直接 useMemo 会导致 20-50 次/秒 re-render。
    // 用 rAF 批量更新，每帧最多触发一次 React state 更新（~60fps）。

    const [displayMessages, setDisplayMessages] = useState<ChatMessage[]>([]);
    const pendingRef = useRef<ChatMessage[]>([]);
    const rafIdRef = useRef(0);

    useEffect(() => {
        // 缓存最新计算结果
        // 先过滤掉 hide_from_ui 标记的消息（如自动注入的 editor context SystemMessage），
        // 再 map 转换；toChatMessage 可能返回 null（system 消息防御），用 filter(Boolean) 移除
        pendingRef.current = (stream.messages ?? [])
            .filter(msg => !isHiddenFromUI(msg))
            .map(toChatMessage)
            .filter((m): m is ChatMessage => m !== null);

        if (activeTraceSpan.current && pendingRef.current.length > 0) {
            recordToolCallEvents(
                activeTraceSpan.current,
                pendingRef.current,
                seenMessageToolCallIds.current,
            );

            activeTraceSpan.current.addEvent('values_received', {
                messageCount: pendingRef.current.length,
            });

            if (
                !hasSeenFirstMessageChunk.current &&
                pendingRef.current.some(msg => msg.role === 'ai')
            ) {
                activeTraceSpan.current.addEvent('first_message_chunk_received', {
                    messageCount: pendingRef.current.length,
                });
                hasSeenFirstMessageChunk.current = true;
            }
        }

        // 安排下一帧刷新（如果尚未安排）
        if (!rafIdRef.current) {
            rafIdRef.current = requestAnimationFrame(() => {
                setDisplayMessages(pendingRef.current);
                rafIdRef.current = 0;
            });
        }

        return () => {
            if (rafIdRef.current) {
                cancelAnimationFrame(rafIdRef.current);
                rafIdRef.current = 0;
            }
        };
    }, [stream.messages]);

    const messages = displayMessages;

    // 从 stream 中提取中断信息
    const interrupt: ToolInterrupt | null = useMemo(
        () => extractInterrupt(stream.interrupt),
        [stream.interrupt],
    );

    useEffect(() => {
        recordToolInterruptEvent(
            activeTraceSpan.current,
            interrupt,
            seenInterruptToolCallIds.current,
        );
    }, [interrupt]);

    // AI 正在流式生成：isLoading + 最后一条消息是 AI
    const isLastMessageStreaming =
        stream.isLoading && messages.length > 0 && messages[messages.length - 1].role === 'ai';

    const sendMessage = useCallback(
        async (content: string, context?: Record<string, unknown>) => {
            const tracer = getContainer().get(TracingService);

            // 查找已有的 thread 级 traceId（首条消息时 threadId 可能为 null）
            const existingTraceId = threadId ? threadTraceIds.current.get(threadId) : undefined;

            // 创建 root span — 复用 traceId 或自动生成
            const rootSpan = tracer.startSpan('frontend.chat.sendMessage', {
                ...(existingTraceId ? { traceId: existingTraceId } : {}),
                attributes: {
                    'chat.messageLength': content.length,
                },
            });
            activeTraceSpan.current = rootSpan;
            activeTraceId.current = rootSpan.traceId;

            // 持久化 traceId：thread 已知时直接存入 map，否则暂存待 onThreadId 回调
            if (threadId) {
                if (!threadTraceIds.current.has(threadId)) {
                    threadTraceIds.current.set(threadId, rootSpan.traceId);
                }
            } else {
                pendingTraceId.current = rootSpan.traceId;
            }

            traceparentRef.current = tracer.getTraceparent(rootSpan.traceId, rootSpan.spanId);
            rootSpan.addEvent('request_submitted', {
                messageLength: content.length,
                hasContext: Boolean(context && Object.keys(context).length > 0),
            });

            await stream.submit(
                {
                    messages: [
                        {
                            type: 'human',
                            content,
                        } as Message,
                    ],
                },
                {
                    context: context as never,
                    metadata: { __trace: { traceId: rootSpan.traceId } },
                },
            );
        },
        [stream, threadId],
    );

    const resumeWithToolResult = useCallback(
        async (toolCallId: string, result: unknown) => {
            const tracer = getContainer().get(TracingService);

            const traceId =
                (threadId && threadTraceIds.current.get(threadId)) ??
                activeTraceId.current ??
                undefined;

            const resumeSpan = tracer.startSpan('POST /runs/resume', {
                ...(traceId ? { traceId } : {}),
                parentSpanId: activeTraceSpan.current?.spanId,
                attributes: {
                    'tool.call_id': toolCallId,
                },
            });
            traceparentRef.current = tracer.getTraceparent(resumeSpan.traceId, resumeSpan.spanId);

            await stream.submit(null, {
                command: {
                    resume: {
                        tool_call_id: toolCallId,
                        tool_result: result,
                    },
                },
            });

            tracer.endSpan(resumeSpan);
        },
        [stream, threadId],
    );

    const stop = useCallback(async () => {
        await stream.stop();
    }, [stream]);

    // 结束 trace span 当 stream 结束时
    useEffect(() => {
        if (!stream.isLoading && activeTraceSpan.current) {
            const tracer = getContainer().get(TracingService);
            if (stream.error) {
                activeTraceSpan.current.setError(String(stream.error));
            }
            activeTraceSpan.current.addEvent('stream_ended', {
                hasError: Boolean(stream.error),
            });
            tracer.endSpan(activeTraceSpan.current);
            traceparentRef.current = null;
            tracer.forceFlush();
            activeTraceSpan.current = null;
            hasSeenFirstMessageChunk.current = false;
            seenMessageToolCallIds.current.clear();
            seenInterruptToolCallIds.current.clear();
        }
    }, [stream.isLoading, stream.error]);

    const traceContext: TraceContext | null = activeTraceSpan.current
        ? getContainer().get(TracingService).toTraceContext(activeTraceSpan.current)
        : null;

    return useMemo(
        () => ({
            messages,
            isStreaming: stream.isLoading,
            isLastMessageStreaming,
            error: stream.error ? String(stream.error) : null,
            threadId,
            runId,
            interrupt,
            traceContext,
            sendMessage,
            resumeWithToolResult,
            stop,
        }),
        [
            messages,
            stream.isLoading,
            isLastMessageStreaming,
            stream.error,
            threadId,
            runId,
            interrupt,
            traceContext,
            sendMessage,
            resumeWithToolResult,
            stop,
        ],
    );
}
