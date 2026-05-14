import { Emitter } from '@/base/common/event';
import { ConversationContext, ConversationStateMachine } from '../conversation-statemachine';
import { ConversationState } from '../conversation-statemachine.types';

describe('ConversationStateMachine', () => {
    let sm: ConversationStateMachine;
    let transitions: Array<{ from: ConversationState; to: ConversationState }> = [];

    const mockCtx: ConversationContext = {
        conversationId: 'conv-1',
        clientId: 'client-1',
    };

    beforeEach(() => {
        sm = new ConversationStateMachine();
        transitions = [];
        sm.onEvent(event => {
            if (event.type === 'transition') {
                transitions.push({
                    from: event.from,
                    to: event.to,
                    conversationId: event.conversationId,
                });
            }
        });
    });

    describe('state transitions', () => {
        it('starts in Idle state', () => {
            const session = sm.create(mockCtx);
            expect(session.state).toBe(ConversationState.Idle);
        });

        it('transitions Idle → BuildingContext on receiveMessage', () => {
            const session = sm.create(mockCtx);
            sm.receiveMessage(session.conversationId, 'Hello');
            expect(session.state).toBe(ConversationState.BuildingContext);
        });

        it('transitions BuildingContext → Processing on contextReady', () => {
            const session = sm.create(mockCtx);
            sm.receiveMessage(session.conversationId, 'Hello');
            sm.contextReady(session.conversationId);
            expect(session.state).toBe(ConversationState.Processing);
        });

        it('transitions Processing → ToolWaiting on toolCall with confirmation', () => {
            const session = sm.create(mockCtx);
            sm.receiveMessage(session.conversationId, 'Hello');
            sm.contextReady(session.conversationId);
            sm.toolCall(session.conversationId, {
                toolCallId: 'tc-1',
                toolName: 'search',
                input: {},
                requiresConfirmation: true,
            });
            expect(session.state).toBe(ConversationState.ToolWaiting);
        });

        it('transitions Processing → ToolExecuting on toolCall without confirmation', () => {
            const session = sm.create(mockCtx);
            sm.receiveMessage(session.conversationId, 'Hello');
            sm.contextReady(session.conversationId);
            sm.toolCall(session.conversationId, {
                toolCallId: 'tc-1',
                toolName: 'search',
                input: {},
                requiresConfirmation: false,
            });
            expect(session.state).toBe(ConversationState.ToolExecuting);
        });

        it('transitions ToolWaiting → ToolExecuting on toolResult', () => {
            const session = sm.create(mockCtx);
            sm.receiveMessage(session.conversationId, 'Hello');
            sm.contextReady(session.conversationId);
            sm.toolCall(session.conversationId, {
                toolCallId: 'tc-1',
                toolName: 'search',
                input: {},
                requiresConfirmation: true,
            });
            sm.toolResult(session.conversationId, 'tc-1');
            expect(session.state).toBe(ConversationState.ToolExecuting);
        });

        it('transitions ToolExecuting → Processing on toolDone', () => {
            const session = sm.create(mockCtx);
            sm.receiveMessage(session.conversationId, 'Hello');
            sm.contextReady(session.conversationId);
            sm.toolCall(session.conversationId, {
                toolCallId: 'tc-1',
                toolName: 'search',
                input: {},
                requiresConfirmation: false,
            });
            sm.toolDone(session.conversationId);
            expect(session.state).toBe(ConversationState.Processing);
        });

        it('transitions Processing → Done on llmDone', () => {
            const session = sm.create(mockCtx);
            sm.receiveMessage(session.conversationId, 'Hello');
            sm.contextReady(session.conversationId);
            sm.llmDone(session.conversationId);
            expect(session.state).toBe(ConversationState.Done);
        });

        it('transitions any → Done on stop', () => {
            const session = sm.create(mockCtx);
            sm.receiveMessage(session.conversationId, 'Hello');
            sm.stop(session.conversationId);
            expect(session.state).toBe(ConversationState.Done);
        });

        it('rejects invalid transition', () => {
            const session = sm.create(mockCtx);
            sm.receiveMessage(session.conversationId, 'Hello');
            expect(() => {
                sm.transition(session.conversationId, ConversationState.Idle);
            }).toThrow(/invalid transition/i);
        });
    });

    describe('concurrency', () => {
        it('prevents duplicate active sessions for same conversation', () => {
            sm.create(mockCtx);
            expect(() => {
                sm.create(mockCtx);
            }).toThrow(/already active/i);
        });
    });

    describe('cleanup', () => {
        it('removes session from maps', () => {
            const session = sm.create(mockCtx);
            sm.cleanup(session.conversationId);
            expect(sm.findByConversationId(session.conversationId)).toBeNull();
        });
    });

    describe('stop', () => {
        it('throws when conversation not found', () => {
            expect(() => {
                sm.stop('nonexistent-conv');
            }).toThrow(/session not found/i);
        });
    });

    describe('error', () => {
        it('throws when conversation not found', () => {
            expect(() => {
                sm.error('nonexistent-conv', 'ERR', 'something went wrong');
            }).toThrow(/session not found/i);
        });
    });
});
