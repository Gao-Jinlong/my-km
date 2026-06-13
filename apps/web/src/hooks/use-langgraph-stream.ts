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
import { langgraphClient } from '@/features/ai/sdk/langgraph-client';
import type { ActiveSpan } from '@/lib/tracing/tracer';
import { getTracer } from '@/lib/tracing/tracer';

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

    const stream = useStream<{ messages: Message[] }>({
        client: langgraphClient,
        assistantId: 'default',
        threadId,
        messagesKey: 'messages',
        onThreadId: id => {
            setThreadId(id);
        },
        onCreated: info => {
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

    // AI 正在流式生成：isLoading + 最后一条消息是 AI
    const isLastMessageStreaming =
        stream.isLoading && messages.length > 0 && messages[messages.length - 1].role === 'ai';

    const sendMessage = useCallback(
        async (content: string, context?: Record<string, unknown>) => {
            const tracer = getTracer();

            // 创建根 Span
            const rootSpan = tracer.startSpan('frontend.chat.sendMessage', {
                attributes: {
                    'chat.messageLength': content.length,
                },
            });
            activeTraceSpan.current = rootSpan;
            activeTraceId.current = rootSpan.traceId;

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
                    // context 通过 SubmitOptions 透传到后端
                    context: {
                        ...context,
                        // 传递 traceparent 给后端
                        _traceparent: tracer.getTraceparent(rootSpan.traceId, rootSpan.spanId),
                    } as never,
                },
            );
        },
        [stream],
    );

    const resumeWithToolResult = useCallback(
        async (toolCallId: string, result: unknown) => {
            const tracer = getTracer();

            // 创建 resume Span（与 sendMessage 同一 trace）
            const resumeSpan = tracer.startSpan('POST /runs/resume', {
                traceId: activeTraceId.current ?? undefined,
                parentSpanId: activeTraceSpan.current?.spanId,
                attributes: {
                    'tool.callId': toolCallId,
                },
            });

            // 通过 submit(null, { command: { resume: ... } }) 触发恢复
            // 后端 ThreadsController.streamRun() 检测 body.command.resume 进入 resume 分支
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
        [stream],
    );

    const stop = useCallback(async () => {
        await stream.stop();
    }, [stream]);

    // 结束 trace span 当 stream 结束时
    useEffect(() => {
        if (!stream.isLoading && activeTraceSpan.current) {
            const tracer = getTracer();
            if (stream.error) {
                activeTraceSpan.current.setError(String(stream.error));
            }
            tracer.endSpan(activeTraceSpan.current);
            activeTraceSpan.current = null;
        }
    }, [stream.isLoading, stream.error]);

    return useMemo(
        () => ({
            messages,
            isStreaming: stream.isLoading,
            isLastMessageStreaming,
            error: stream.error ? String(stream.error) : null,
            threadId,
            runId,
            interrupt,
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
            sendMessage,
            resumeWithToolResult,
            stop,
        ],
    );
}
