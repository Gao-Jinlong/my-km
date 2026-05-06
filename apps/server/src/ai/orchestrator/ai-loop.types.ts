/**
 * AILoopOrchestrator 类型定义
 */

import type { InFlightToolCall } from '../ai.types';

export interface LoopOpts {
    maxToolRounds?: number; // 默认 10
    tokenLimit?: number; // 上下文窗口 token 上限（可选）
}

export interface StreamCallbacks {
    onChunk: (content: string) => void;
    onToolCall: (toolCall: InFlightToolCall) => void;
    onDone: () => void;
    onError: (error: Error) => void;
}

export interface ToolResultData {
    toolCallId: string;
    result: unknown;
    error?: string;
}
