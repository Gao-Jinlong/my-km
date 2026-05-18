/**
 * Room API Service
 *
 * REST API client for room management.
 * Uses native fetch with the server at http://localhost:3001.
 */

const API_BASE = process.env.NEXT_PUBLIC_AI_API_URL ?? 'http://localhost:3001';

export interface RoomRecord {
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

export async function listRooms(opts?: {
    limit?: number;
    offset?: number;
    status?: string;
}): Promise<RoomRecord[]> {
    const params = new URLSearchParams();
    if (opts?.limit) params.set('limit', String(opts.limit));
    if (opts?.offset) params.set('offset', String(opts.offset));
    if (opts?.status) params.set('status', opts.status);

    const res = await fetch(`${API_BASE}/ai/rooms?${params}`);
    if (!res.ok) throw new Error(`Failed to list rooms: ${res.status}`);

    const data = (await res.json()) as { rooms: RoomRecord[] };
    return data.rooms;
}

export async function createRoom(opts?: { id?: string; title?: string }): Promise<RoomRecord> {
    const res = await fetch(`${API_BASE}/ai/rooms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(opts ?? {}),
    });
    if (!res.ok) throw new Error(`Failed to create room: ${res.status}`);

    const data = (await res.json()) as { room: RoomRecord };
    return data.room;
}

export async function getRoomMessages(
    roomId: string,
    opts?: { limit?: number; offset?: number },
): Promise<MessageRecord[]> {
    const params = new URLSearchParams();
    if (opts?.limit) params.set('limit', String(opts.limit));
    if (opts?.offset) params.set('offset', String(opts.offset));

    const res = await fetch(`${API_BASE}/ai/rooms/${roomId}/messages?${params}`);
    if (!res.ok) throw new Error(`Failed to get messages: ${res.status}`);

    const data = (await res.json()) as { messages: MessageRecord[] };
    return data.messages;
}

export async function updateRoomTitle(roomId: string, title: string): Promise<RoomRecord> {
    const res = await fetch(`${API_BASE}/ai/rooms/${roomId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
    });
    if (!res.ok) throw new Error(`Failed to update room: ${res.status}`);

    const data = (await res.json()) as { room: RoomRecord };
    return data.room;
}

export async function deleteRoom(roomId: string): Promise<void> {
    const res = await fetch(`${API_BASE}/ai/rooms/${roomId}`, {
        method: 'DELETE',
    });
    if (!res.ok) throw new Error(`Failed to delete room: ${res.status}`);
}
