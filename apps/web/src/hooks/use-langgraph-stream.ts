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
 *   metadata → values → end（或 error）
 */

import type { Message } from '@langchain/langgraph-sdk';
import { useStream } from '@langchain/langgraph-sdk/react';
import { useCallback, useMemo, useState } from 'react';
import { langgraphClient } from '@/features/ai/sdk/langgraph-client';

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
    error: string | null;
    threadId: string | null;
    runId: string | null;
    interrupt: ToolInterrupt | null;
    sendMessage: (content: string, context?: Record<string, unknown>) => Promise<void>;
    resumeWithToolResult: (toolCallId: string, result: unknown) => Promise<void>;
    stop: () => Promise<void>;
}

/**
 * 将 SDK Message 转换为内部 ChatMessage 格式
 */
function toChatMessage(msg: Message): ChatMessage {
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

    // 从 stream 中提取消息
    const messages: ChatMessage[] = useMemo(
        () => (stream.messages ?? []).map(toChatMessage),
        [stream.messages],
    );

    // 从 stream 中提取中断信息
    const interrupt: ToolInterrupt | null = useMemo(
        () => extractInterrupt(stream.interrupt),
        [stream.interrupt],
    );

    const sendMessage = useCallback(
        async (content: string, context?: Record<string, unknown>) => {
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
                    context: context as never,
                },
            );
        },
        [stream],
    );

    const resumeWithToolResult = useCallback(
        async (toolCallId: string, result: unknown) => {
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
        },
        [stream],
    );

    const stop = useCallback(async () => {
        await stream.stop();
    }, [stream]);

    return useMemo(
        () => ({
            messages,
            isStreaming: stream.isLoading,
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
