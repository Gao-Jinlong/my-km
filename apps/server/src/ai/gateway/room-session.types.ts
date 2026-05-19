/**
 * Room session types — Phase 1 rewrite.
 *
 * Replaces: room-statemachine.types.ts + workflow.types.ts (partial)
 * Re-exports executor types for use in gateway layer.
 */

import type { ErrorCode, FinishReason, ServerMessage } from './ai-ws-events.types';

// === RoomStateMachine states ===

export enum RoomState {
    Idle = 'idle',
    BuildingContext = 'building_context',
    Processing = 'processing',
    ToolWaiting = 'tool_waiting',
    ToolExecuting = 'tool_executing',
    Done = 'done',
}

const VALID_TRANSITIONS: Record<RoomState, RoomState[]> = {
    [RoomState.Idle]: [RoomState.BuildingContext],
    [RoomState.BuildingContext]: [RoomState.Processing, RoomState.Done],
    [RoomState.Processing]: [RoomState.ToolWaiting, RoomState.ToolExecuting, RoomState.Done],
    [RoomState.ToolWaiting]: [RoomState.ToolExecuting, RoomState.Done],
    [RoomState.ToolExecuting]: [RoomState.Processing, RoomState.Done],
    [RoomState.Done]: [],
};

export function isValidTransition(from: RoomState, to: RoomState): boolean {
    return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

// === Re-export executor types ===

export type {
    ExecutionCtx,
    ExecutorDependencies,
    WorkflowCallbacks,
    WorkflowToolCall,
} from '../workflow-runtime/executor.types';

// === EmitFn ===

export type EmitFn = (msg: ServerMessage) => void;
