/**
 * Thread API Service
 *
 * REST API client for thread management.
 * Uses native fetch with the server at http://localhost:3001.
 * Aligned with backend Thread/Run architecture.
 */

const API_BASE = process.env.NEXT_PUBLIC_AI_API_URL ?? 'http://localhost:3001';

export interface ThreadRecord {
    id: string;
    userId: string | null;
    title: string | null;
    status: 'active' | 'archived' | 'deleted';
    model: string | null;
    provider: string | null;
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

export async function listThreads(opts?: {
    limit?: number;
    offset?: number;
    status?: string;
}): Promise<ThreadRecord[]> {
    const params = new URLSearchParams();
    if (opts?.limit) params.set('limit', String(opts.limit));
    if (opts?.offset) params.set('offset', String(opts.offset));
    if (opts?.status) params.set('status', opts.status);

    const res = await fetch(`${API_BASE}/api/v1/ai/threads?${params}`);
    if (!res.ok) throw new Error(`Failed to list threads: ${res.status}`);

    const data = (await res.json()) as ThreadRecord[];
    return data;
}

export async function createThread(opts?: { id?: string; title?: string }): Promise<ThreadRecord> {
    const res = await fetch(`${API_BASE}/api/v1/ai/threads`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(opts ?? {}),
    });
    if (!res.ok) throw new Error(`Failed to create thread: ${res.status}`);

    return (await res.json()) as ThreadRecord;
}

export async function getThreadMessages(
    threadId: string,
    opts?: { limit?: number; offset?: number },
): Promise<MessageRecord[]> {
    const params = new URLSearchParams();
    if (opts?.limit) params.set('limit', String(opts.limit));
    if (opts?.offset) params.set('offset', String(opts.offset));

    const res = await fetch(`${API_BASE}/api/v1/ai/threads/${threadId}/messages?${params}`);
    if (!res.ok) throw new Error(`Failed to get messages: ${res.status}`);

    const data = (await res.json()) as { messages: MessageRecord[] };
    return data.messages;
}

export async function updateThreadTitle(threadId: string, title: string): Promise<ThreadRecord> {
    const res = await fetch(`${API_BASE}/api/v1/ai/threads/${threadId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
    });
    if (!res.ok) throw new Error(`Failed to update thread: ${res.status}`);

    return (await res.json()) as ThreadRecord;
}

export async function deleteThread(threadId: string): Promise<void> {
    const res = await fetch(`${API_BASE}/api/v1/ai/threads/${threadId}`, {
        method: 'DELETE',
    });
    if (!res.ok) throw new Error(`Failed to delete thread: ${res.status}`);
}

// ========== Deprecated aliases for gradual migration ==========

/** @deprecated Use ThreadRecord instead */
export type RoomRecord = ThreadRecord;

/** @deprecated Use listThreads instead */
export const listRooms = listThreads;

/** @deprecated Use createThread instead */
export const createRoom = createThread;

/** @deprecated Use getThreadMessages instead */
export const getRoomMessages = getThreadMessages;

/** @deprecated Use updateThreadTitle instead */
export const updateRoomTitle = updateThreadTitle;

/** @deprecated Use deleteThread instead */
export const deleteRoom = deleteThread;
