/**
 * Conversation State Machine types
 */

export enum ConversationState {
    Idle = 'idle',
    BuildingContext = 'building_context',
    Processing = 'processing',
    ToolWaiting = 'tool_waiting',
    ToolExecuting = 'tool_executing',
    Done = 'done',
}

export type FinishReason = 'complete' | 'max_turns' | 'stopped' | 'error' | 'interrupted';

export interface ConversationFSM {
    conversationId: string;
    state: ConversationState;
    abortController: AbortController;
    createdAt: Date;
    lastActivityAt: Date;
}

export interface StateTransition {
    from: ConversationState;
    to: ConversationState;
    conversationId: string;
}

// Valid transitions matrix
const VALID_TRANSITIONS: Record<ConversationState, ConversationState[]> = {
    [ConversationState.Idle]: [ConversationState.BuildingContext],
    [ConversationState.BuildingContext]: [ConversationState.Processing, ConversationState.Done],
    [ConversationState.Processing]: [
        ConversationState.Processing,
        ConversationState.ToolWaiting,
        ConversationState.ToolExecuting,
        ConversationState.Done,
    ],
    [ConversationState.ToolWaiting]: [ConversationState.ToolExecuting, ConversationState.Done],
    [ConversationState.ToolExecuting]: [ConversationState.Processing, ConversationState.Done],
    [ConversationState.Done]: [],
};

export function isValidTransition(from: ConversationState, to: ConversationState): boolean {
    return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}
