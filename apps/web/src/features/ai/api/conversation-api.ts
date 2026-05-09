/**
 * Conversation API Service
 *
 * REST API client for conversation management.
 * Uses native fetch with the server at http://localhost:3001.
 */

const API_BASE = import.meta.env.VITE_AI_API_URL ?? 'http://localhost:3001';

export interface ConversationRecord {
    id: string;
    title: string | null;
    status: 'active' | 'archived' | 'deleted';
    messageCount: number;
    createdAt: string;
    updatedAt: string;
}

export interface MessageRecord {
    id: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    toolCalls?: unknown[];
    toolResultId?: string;
    tokenCount?: number;
    createdAt: string;
}

export async function listConversations(opts?: {
    limit?: number;
    offset?: number;
    status?: string;
}): Promise<ConversationRecord[]> {
    const params = new URLSearchParams();
    if (opts?.limit) params.set('limit', String(opts.limit));
    if (opts?.offset) params.set('offset', String(opts.offset));
    if (opts?.status) params.set('status', opts.status);

    const res = await fetch(`${API_BASE}/ai/conversations?${params}`);
    if (!res.ok) throw new Error(`Failed to list conversations: ${res.status}`);

    const data = (await res.json()) as { conversations: ConversationRecord[] };
    return data.conversations;
}

export async function createConversation(opts?: {
    id?: string;
    title?: string;
}): Promise<ConversationRecord> {
    const res = await fetch(`${API_BASE}/ai/conversations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(opts ?? {}),
    });
    if (!res.ok) throw new Error(`Failed to create conversation: ${res.status}`);

    const data = (await res.json()) as { conversation: ConversationRecord };
    return data.conversation;
}

export async function getConversationMessages(
    conversationId: string,
    opts?: { limit?: number; offset?: number },
): Promise<MessageRecord[]> {
    const params = new URLSearchParams();
    if (opts?.limit) params.set('limit', String(opts.limit));
    if (opts?.offset) params.set('offset', String(opts.offset));

    const res = await fetch(`${API_BASE}/ai/conversations/${conversationId}/messages?${params}`);
    if (!res.ok) throw new Error(`Failed to get messages: ${res.status}`);

    const data = (await res.json()) as { messages: MessageRecord[] };
    return data.messages;
}

export async function updateConversationTitle(
    conversationId: string,
    title: string,
): Promise<ConversationRecord> {
    const res = await fetch(`${API_BASE}/ai/conversations/${conversationId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
    });
    if (!res.ok) throw new Error(`Failed to update conversation: ${res.status}`);

    const data = (await res.json()) as { conversation: ConversationRecord };
    return data.conversation;
}

export async function deleteConversation(conversationId: string): Promise<void> {
    const res = await fetch(`${API_BASE}/ai/conversations/${conversationId}`, {
        method: 'DELETE',
    });
    if (!res.ok) throw new Error(`Failed to delete conversation: ${res.status}`);
}
