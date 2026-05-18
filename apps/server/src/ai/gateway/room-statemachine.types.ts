/**
 * Room State Machine types
 */

export enum RoomState {
    Idle = 'idle',
    BuildingContext = 'building_context',
    Processing = 'processing',
    ToolWaiting = 'tool_waiting',
    ToolExecuting = 'tool_executing',
    Done = 'done',
}

export type FinishReason = 'complete' | 'max_turns' | 'stopped' | 'error' | 'interrupted';

export interface RoomFSM {
    roomId: string;
    state: RoomState;
    abortController: AbortController;
    createdAt: Date;
    lastActivityAt: Date;
}

export type RoomStateTransition = {
    from: RoomState;
    to: RoomState;
    roomId: string;
};

// Valid transitions matrix
const VALID_TRANSITIONS: Record<RoomState, RoomState[]> = {
    [RoomState.Idle]: [RoomState.BuildingContext],
    [RoomState.BuildingContext]: [RoomState.Processing, RoomState.Done],
    [RoomState.Processing]: [
        RoomState.Processing,
        RoomState.ToolWaiting,
        RoomState.ToolExecuting,
        RoomState.Done,
    ],
    [RoomState.ToolWaiting]: [RoomState.ToolExecuting, RoomState.Done],
    [RoomState.ToolExecuting]: [RoomState.Processing, RoomState.Done],
    [RoomState.Done]: [],
};

export function isValidTransition(from: RoomState, to: RoomState): boolean {
    return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}
