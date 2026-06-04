/**
 * useAIThread — 替代 useAIHarness 的 LangGraph Protocol hook
 *
 * 通过 SSE 协议连接后端，提供消息流式展示、工具中断恢复、停止生成等能力。
 * 替代旧的 Socket.io + AIHarnessService + useSyncExternalStore 体系。
 *
 * 使用方式:
 *   const { messages, isStreaming, sendMessage, stop, interrupt } = useAIThread();
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    type ChatRequest,
    cancelChat,
    type SSEEvent,
    streamChat,
    streamResume,
} from '@/features/ai/sdk/nest-transport';

// ========== Types ==========

export interface ChatMessage {
    id: string;
    role: 'human' | 'ai' | 'system' | 'tool';
    content: string;
    toolCalls?: Array<{ id: string; name: string; args: Record<string, unknown> }>;
    toolCallId?: string;
    timestamp: number;
}

export interface ToolInterrupt {
    toolCallId: string;
    toolName: string;
    input: Record<string, unknown>;
}

export interface UseAIThreadReturn {
    /** 消息列表 */
    messages: ChatMessage[];
    /** 是否正在流式传输 */
    isStreaming: boolean;
    /** 当前错误 */
    error: string | null;
    /** 当前房间 ID (thread ID) */
    roomId: string | null;
    /** 工具中断信息 (需要前端确认的工具调用) */
    interrupt: ToolInterrupt | null;

    /** 发送消息 */
    sendMessage: (content: string, context?: ChatRequest['context']) => Promise<void>;
    /** 恢复工具调用中断 */
    resumeWithToolResult: (toolCallId: string, result: unknown) => Promise<void>;
    /** 停止生成 */
    stop: () => void;
}

// ========== SSE Event Processing ==========

interface StreamState {
    messages: ChatMessage[];
    currentAiMessageId: string | null;
    currentAiContent: string;
    currentContentBlockIndex: number;
    roomId: string | null;
    interrupt: ToolInterrupt | null;
}

/**
 * 处理单个 SSE 事件，更新流状态
 */
function processEvent(state: StreamState, event: SSEEvent): StreamState {
    const { event: method, data } = event;
    const d = data as Record<string, unknown>;

    switch (method) {
        // ---- Lifecycle Events ----
        case 'lifecycle': {
            const lifecycleData = d as { event: string; error?: string; threadId?: string };
            if (lifecycleData.event === 'started' && lifecycleData.threadId) {
                return { ...state, roomId: lifecycleData.threadId };
            }
            if (lifecycleData.event === 'failed') {
                return { ...state, interrupt: null };
            }
            if (lifecycleData.event === 'interrupted') {
                return state; // interrupt 详情由 tools 事件提供
            }
            return state;
        }

        // ---- Messages Events ----
        case 'messages': {
            const msgData = d as Record<string, unknown>;
            const msgEvent = msgData.event as string;

            switch (msgEvent) {
                case 'message-start': {
                    const msgId = msgData.message_id as string;
                    return {
                        ...state,
                        currentAiMessageId: msgId,
                        currentAiContent: '',
                        currentContentBlockIndex: 0,
                    };
                }

                case 'content-block-delta': {
                    const delta = msgData.delta as { type: string; text?: string };
                    if (delta.type === 'text-delta' && delta.text) {
                        const newContent = state.currentAiContent + delta.text;
                        // 更新当前 AI 消息的内容
                        const messages = state.currentAiMessageId
                            ? state.messages.map(m =>
                                  m.id === state.currentAiMessageId
                                      ? { ...m, content: newContent }
                                      : m,
                              )
                            : state.messages;

                        return { ...state, currentAiContent: newContent, messages };
                    }
                    return state;
                }

                case 'content-block-finish': {
                    return {
                        ...state,
                        currentContentBlockIndex: state.currentContentBlockIndex + 1,
                    };
                }

                case 'message-finish': {
                    // 消息完成 — 如果是 AI 消息，确保它已经在 messages 列表中
                    const msgId = state.currentAiMessageId;
                    if (msgId) {
                        const exists = state.messages.some(m => m.id === msgId);
                        const messages = exists
                            ? state.messages
                            : [
                                  ...state.messages,
                                  {
                                      id: msgId,
                                      role: 'ai' as const,
                                      content: state.currentAiContent,
                                      timestamp: Date.now(),
                                  },
                              ];
                        return {
                            ...state,
                            messages,
                            currentAiMessageId: null,
                            currentAiContent: '',
                        };
                    }
                    return state;
                }

                default:
                    return state;
            }
        }

        // ---- Tools Events ----
        case 'tools': {
            const toolData = d as Record<string, unknown>;
            const toolEvent = toolData.event as string;

            if (toolEvent === 'tool-started') {
                // 工具需要前端确认 → 设置 interrupt
                return {
                    ...state,
                    interrupt: {
                        toolCallId: toolData.tool_call_id as string,
                        toolName: toolData.name as string,
                        input: (toolData.args as Record<string, unknown>) ?? {},
                    },
                };
            }

            if (toolEvent === 'tool-completed' || toolEvent === 'tool-error') {
                return { ...state, interrupt: null };
            }

            return state;
        }

        // ---- Values Events ----
        case 'values': {
            const valuesData = d as { threadId?: string };
            return {
                ...state,
                roomId: valuesData.threadId ?? state.roomId,
            };
        }

        // ---- Error Events ----
        case 'error': {
            const _errorData = d as { message?: string; error?: string };
            // 错误通过 error state 传播，不在这里处理
            return state;
        }

        default:
            return state;
    }
}

// ========== Hook ==========

export function useAIThread(): UseAIThreadReturn {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [isStreaming, setIsStreaming] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [roomId, setRoomId] = useState<string | null>(null);
    const [interrupt, setInterrupt] = useState<ToolInterrupt | null>(null);

    const abortRef = useRef<AbortController | null>(null);
    const stateRef = useRef<StreamState>({
        messages: [],
        currentAiMessageId: null,
        currentAiContent: '',
        currentContentBlockIndex: 0,
        roomId: null,
        interrupt: null,
    });

    // 清理
    useEffect(() => {
        return () => {
            abortRef.current?.abort();
        };
    }, []);

    const sendMessage = useCallback(
        async (content: string, context?: ChatRequest['context']) => {
            // 取消之前未完成的请求
            abortRef.current?.abort();
            const controller = new AbortController();
            abortRef.current = controller;

            // 重置状态
            setError(null);
            setIsStreaming(true);
            setInterrupt(null);

            // 添加用户消息
            const userMsg: ChatMessage = {
                id: `user-${Date.now()}`,
                role: 'human',
                content,
                timestamp: Date.now(),
            };

            const initialState: StreamState = {
                messages: [...stateRef.current.messages, userMsg],
                currentAiMessageId: null,
                currentAiContent: '',
                currentContentBlockIndex: 0,
                roomId: stateRef.current.roomId,
                interrupt: null,
            };

            stateRef.current = initialState;
            setMessages(initialState.messages);

            try {
                for await (const event of streamChat(
                    { content, roomId: stateRef.current.roomId ?? undefined, context },
                    controller.signal,
                )) {
                    if (controller.signal.aborted) break;

                    // 处理 error 事件
                    if (event.event === 'error') {
                        const errData = event.data as { message?: string };
                        setError(errData.message ?? 'Unknown error');
                        continue;
                    }

                    // 处理 lifecycle completed → 提取 roomId
                    if (event.event === 'lifecycle') {
                        const ld = event.data as { event: string };
                        if (ld.event === 'completed') {
                            // Stream 完成
                        }
                    }

                    const newState = processEvent(stateRef.current, event);
                    stateRef.current = newState;

                    // 同步到 React 状态
                    setMessages([...newState.messages]);
                    if (newState.roomId !== roomId) {
                        setRoomId(newState.roomId);
                    }
                    if (newState.interrupt !== interrupt) {
                        setInterrupt(newState.interrupt);
                    }
                }
            } catch (err) {
                if ((err as Error).name !== 'AbortError') {
                    setError((err as Error).message);
                }
            } finally {
                setIsStreaming(false);
                abortRef.current = null;
            }
        },
        [roomId, interrupt],
    );

    const resumeWithToolResult = useCallback(
        async (toolCallId: string, result: unknown) => {
            if (!roomId) return;

            abortRef.current?.abort();
            const controller = new AbortController();
            abortRef.current = controller;

            setError(null);
            setIsStreaming(true);
            setInterrupt(null);

            try {
                for await (const event of streamResume(
                    roomId,
                    toolCallId,
                    result,
                    controller.signal,
                )) {
                    if (controller.signal.aborted) break;

                    if (event.event === 'error') {
                        const errData = event.data as { message?: string };
                        setError(errData.message ?? 'Unknown error');
                        continue;
                    }

                    const newState = processEvent(stateRef.current, event);
                    stateRef.current = newState;
                    setMessages([...newState.messages]);
                    if (newState.interrupt !== interrupt) {
                        setInterrupt(newState.interrupt);
                    }
                }
            } catch (err) {
                if ((err as Error).name !== 'AbortError') {
                    setError((err as Error).message);
                }
            } finally {
                setIsStreaming(false);
                abortRef.current = null;
            }
        },
        [roomId, interrupt],
    );

    const stop = useCallback(() => {
        abortRef.current?.abort();
        if (roomId) {
            cancelChat(roomId).catch(() => {});
        }
        setIsStreaming(false);
    }, [roomId]);

    return useMemo(
        () => ({
            messages,
            isStreaming,
            error,
            roomId,
            interrupt,
            sendMessage,
            resumeWithToolResult,
            stop,
        }),
        [messages, isStreaming, error, roomId, interrupt, sendMessage, resumeWithToolResult, stop],
    );
}
