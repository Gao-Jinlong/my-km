import type { LangGraphChatMessage, LangGraphRawMessage, LangGraphToolInterrupt } from './types';

export function isHiddenFromUI(message: LangGraphRawMessage): boolean {
    return message.additional_kwargs?.hide_from_ui === true;
}

export function toLangGraphChatMessage(
    message: LangGraphRawMessage,
    fallbackId: string,
): LangGraphChatMessage | null {
    const role = normalizeRole(message.type ?? message.role ?? 'human');
    if (role === 'system' || isHiddenFromUI(message)) {
        return null;
    }

    const toolCalls =
        role === 'ai' && Array.isArray(message.tool_calls)
            ? message.tool_calls.map((toolCall, index) => ({
                  id: toolCall.id ?? `${fallbackId}-tool-${index}`,
                  name: toolCall.name ?? 'unknown_tool',
              }))
            : undefined;

    const toolCallId =
        role === 'tool' && typeof message.tool_call_id === 'string'
            ? message.tool_call_id
            : undefined;

    const toolStatusRaw = message.additional_kwargs?.tool_status;
    const toolStatus =
        typeof toolStatusRaw === 'string' &&
        ['pending', 'completed', 'rejected'].includes(toolStatusRaw)
            ? (toolStatusRaw as 'pending' | 'completed' | 'rejected')
            : undefined;

    // 从 tool_calls 中提取第一个工具名称（用于 ToolCallCard 显示）
    const toolName =
        role === 'ai' && toolCalls && toolCalls.length > 0 ? toolCalls[0].name : undefined;

    return {
        id: message.id ?? fallbackId,
        role,
        content: stringifyContent(message.content),
        toolCalls,
        toolCallId,
        toolStatus,
        toolName,
    };
}

export function projectMessages(messages: LangGraphRawMessage[]): LangGraphChatMessage[] {
    return messages
        .map((message, index) => toLangGraphChatMessage(message, `msg-${index}`))
        .filter((message): message is LangGraphChatMessage => message !== null);
}

export function extractTaskInterrupts(data: unknown): LangGraphToolInterrupt[] {
    if (!data || typeof data !== 'object') {
        return [];
    }

    const interrupts = (data as { interrupts?: unknown }).interrupts;
    if (!Array.isArray(interrupts)) {
        return [];
    }

    return interrupts
        .map((interrupt, index) => extractInterrupt(interrupt, index))
        .filter((interrupt): interrupt is LangGraphToolInterrupt => interrupt !== null);
}

function extractInterrupt(interrupt: unknown, index: number): LangGraphToolInterrupt | null {
    if (!interrupt || typeof interrupt !== 'object') {
        return null;
    }

    const obj = interrupt as Record<string, unknown>;
    const value =
        obj.value && typeof obj.value === 'object' ? (obj.value as Record<string, unknown>) : {};

    const toolCallId =
        asNonEmptyString(value.tool_call_id) ?? asNonEmptyString(obj.id) ?? `interrupt-${index}`;
    const toolName =
        asNonEmptyString(value.tool_name) ??
        asNonEmptyString(value.name) ??
        asNonEmptyString(obj.name) ??
        'unknown_tool';
    const input = toRecord(value.args) ?? toRecord(value.input) ?? {};

    return { toolCallId, toolName, input };
}

function normalizeRole(role: string): LangGraphChatMessage['role'] {
    switch (role) {
        case 'user':
        case 'human':
            return 'human';
        case 'assistant':
        case 'ai':
            return 'ai';
        case 'tool':
            return 'tool';
        case 'system':
            return 'system';
        default:
            return 'ai';
    }
}

function stringifyContent(content: unknown): string {
    if (typeof content === 'string') {
        return content;
    }
    if (Array.isArray(content)) {
        return content
            .map(item => {
                if (typeof item === 'string') {
                    return item;
                }
                if (
                    item &&
                    typeof item === 'object' &&
                    typeof (item as { text?: unknown }).text === 'string'
                ) {
                    return (item as { text: string }).text;
                }
                return '';
            })
            .join('');
    }
    return content == null ? '' : JSON.stringify(content);
}

function asNonEmptyString(value: unknown): string | undefined {
    return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function toRecord(value: unknown): Record<string, unknown> | undefined {
    return value && typeof value === 'object' && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : undefined;
}

/**
 * spec 5.6: 从 messages 中派生 pending 状态的工具 interrupts。
 * 避免使用 Set 去重，直接通过 toolStatus === 'pending' 判断。
 * 每个 pending tool 消息对应一个 interrupt。
 */
export function extractPendingInterrupts(
    messages: LangGraphChatMessage[],
): LangGraphToolInterrupt[] {
    const pending: LangGraphToolInterrupt[] = [];
    for (const msg of messages) {
        if (msg.toolStatus === 'pending' && msg.toolCallId && msg.role === 'tool') {
            // 从消息中提取工具名和输入
            const toolName = msg.content || 'unknown_tool';
            let input: Record<string, unknown> = {};
            try {
                const parsed = JSON.parse(msg.content);
                if (typeof parsed === 'object' && parsed !== null) {
                    input = parsed as Record<string, unknown>;
                }
            } catch {
                // 解析失败时使用空对象
            }
            pending.push({
                toolCallId: msg.toolCallId,
                toolName,
                input,
            });
        }
    }
    return pending;
}
