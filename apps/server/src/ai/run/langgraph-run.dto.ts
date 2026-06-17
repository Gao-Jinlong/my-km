import type { MultitaskStrategy } from '../types/run.types';

/**
 * LangGraph SDK runs.stream() 请求体
 *
 * SDK 发送：
 *   新 run: { input: {messages: [...]}, assistant_id, stream_mode, config?, context? }
 *   resume: { input: null, command: { resume: {...} }, assistant_id, stream_mode }
 */
export interface RunsStreamBody {
    input?: { messages?: Array<{ type: string; content: string; id?: string }> } | null;
    command?: { resume?: unknown } | null;
    assistant_id?: string;
    stream_mode?: string | string[];
    config?: { configurable?: Record<string, unknown> };
    context?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
    multitask_strategy?: MultitaskStrategy;
}
