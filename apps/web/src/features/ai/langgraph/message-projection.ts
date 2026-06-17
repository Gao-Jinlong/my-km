import type { LangGraphChatMessage, LangGraphRawMessage, LangGraphToolInterrupt } from './types';

export function isHiddenFromUI(message: LangGraphRawMessage): boolean {
    return message.additional_kwargs?.hide_from_ui === true;
}

export function toLangGraphChatMessage(
    message: LangGraphRawMessage,
    fallbackId: string,
    resolvedToolCallIds?: Set<string>,
): LangGraphChatMessage | null {
    const role = normalizeRole(message.type ?? message.role ?? 'human');
    // system: 系统提示，不展示。
    // tool: ToolMessage 是工具执行结果回执，作为 LLM 上下文反馈存在，
    //       不应在聊天流单独展示——工具调用的状态已由对应 ai 消息的
    //       ToolCallIndicator（pending/completed）呈现，单独的 tool 消息是冗余的。
    if (role === 'system' || isHiddenFromUI(message)) {
        return null;
    }

    const toolCalls =
        role === 'ai' && Array.isArray(message.tool_calls)
            ? message.tool_calls.map((toolCall, index) => ({
                  id: toolCall.id ?? `${fallbackId}-tool-${index}`,
                  name: toolCall.name ?? 'unknown_tool',
                  args: isPlainArgs(toolCall.args) ? toolCall.args : undefined,
              }))
            : undefined;

    // tool 消息已在函数顶部过滤（return null），不会到达此处，
    // 故无需提取 toolCallId。工具调用状态由 ai 消息的 toolStatus 派生。
    const toolStatusRaw = message.additional_kwargs?.tool_status;
    const toolStatusFromKwargs =
        typeof toolStatusRaw === 'string' &&
        ['pending', 'completed', 'rejected'].includes(toolStatusRaw)
            ? (toolStatusRaw as 'pending' | 'completed' | 'rejected')
            : undefined;

    // spec 5.6: ai 消息的 tool_calls 状态派生。
    // 若已有 tool 角色消息匹配 tool_call_id → completed；否则 pending（interrupt 等待中）。
    // tool 角色消息优先用 additional_kwargs.tool_status（若后端设置）。
    let toolStatus = toolStatusFromKwargs;
    if (!toolStatus && role === 'ai' && toolCalls && toolCalls.length > 0) {
        const resolved = resolvedToolCallIds ?? new Set<string>();
        toolStatus = toolCalls.every(tc => resolved.has(tc.id)) ? 'completed' : 'pending';
    }

    // 从 tool_calls 中提取第一个工具名称（用于 ToolCallCard 显示）
    const toolName =
        role === 'ai' && toolCalls && toolCalls.length > 0 ? toolCalls[0].name : undefined;

    return {
        id: message.id ?? fallbackId,
        role,
        content: stringifyContent(message.content),
        toolCalls,
        // tool 消息已被过滤，toolCallId 永不设置（保留接口兼容）
        toolCallId: undefined,
        toolStatus,
        toolName,
    };
}

export function projectMessages(messages: LangGraphRawMessage[]): LangGraphChatMessage[] {
    // 预扫描：收集所有已「解析」的 tool_call_id（对应存在 tool 角色消息的回执），
    // 用于派生 ai 消息 tool_calls 的 completed/pending 状态。
    const resolvedToolCallIds = new Set<string>();
    for (const msg of messages) {
        if (
            normalizeRole(msg.type ?? msg.role ?? '') === 'tool' &&
            typeof msg.tool_call_id === 'string'
        ) {
            resolvedToolCallIds.add(msg.tool_call_id);
        }
    }

    return messages
        .map((message, index) =>
            toLangGraphChatMessage(message, `msg-${index}`, resolvedToolCallIds),
        )
        .filter((message): message is LangGraphChatMessage => message !== null);
}

function isPlainArgs(value: unknown): value is Record<string, unknown> {
    return value != null && typeof value === 'object' && !Array.isArray(value);
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
