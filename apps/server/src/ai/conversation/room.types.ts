/**
 * Room 模块类型定义
 */

export type RoomStatus = 'active' | 'archived' | 'deleted';

export interface CreateRoomOpts {
    id?: string; // 前端生成的 ID（如 nanoid），可选
    userId?: string;
    title?: string;
    model?: string;
    provider?: string;
}

export interface UpdateRoomOpts {
    title?: string;
    model?: string;
    provider?: string;
    status?: RoomStatus;
}

export interface ListOpts {
    limit?: number;
    offset?: number;
    status?: RoomStatus;
}

export interface RoomStats {
    total: number;
    active: number;
    tokenUsage: number;
}
