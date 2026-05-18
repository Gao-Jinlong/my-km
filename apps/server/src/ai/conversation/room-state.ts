/**
 * Room 状态枚举
 */

export const ROOM_STATUS = {
    ACTIVE: 'active',
    ARCHIVED: 'archived',
    DELETED: 'deleted',
} as const;

export type RoomStatus = (typeof ROOM_STATUS)[keyof typeof ROOM_STATUS];
