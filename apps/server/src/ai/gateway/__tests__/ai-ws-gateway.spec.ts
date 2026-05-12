import { Test } from '@nestjs/testing';
import { ConnectionManager } from '../../connection/connection-manager';
import { ConversationService } from '../../conversation/conversation.service';
import { RequestDispatcher } from '../../dispatch/request-dispatcher';
import { MessageService } from '../../message/message.service';
import { AISessionManager } from '../../session/ai-session-manager';
import { ToolDispatcher } from '../../tools/tool.dispatcher';
import { AiGateway } from '../ai-ws.gateway';
import { ConversationStateMachine } from '../conversation-statemachine';

describe('AiGateway new protocol', () => {
    it('rejects send_message with non-existent conversation', async () => {
        const mockFindById = jest.fn().mockResolvedValue(null);
        const module = await Test.createTestingModule({
            providers: [
                AiGateway,
                {
                    provide: ConnectionManager,
                    useValue: { registerClient: jest.fn(), unregisterClient: jest.fn() },
                },
                { provide: ConversationService, useValue: { findById: mockFindById } },
                { provide: RequestDispatcher, useValue: {} },
                { provide: AISessionManager, useValue: {} },
                { provide: ToolDispatcher, useValue: {} },
                {
                    provide: ConversationStateMachine,
                    useValue: { create: jest.fn(), onEvent: jest.fn(), stop: jest.fn() },
                },
                { provide: MessageService, useValue: {} },
            ],
        }).compile();

        const gw = module.get(AiGateway);
        const emitSpy = jest.fn();
        const testClient = {
            id: 'client-1',
            handshake: { headers: {}, query: {}, auth: {} },
            emit: emitSpy,
            join: jest.fn((room: string, cb?: () => void) => cb?.()),
        };

        let caughtError: Error | null = null;
        try {
            await gw.handleSendMessage(
                {
                    type: 'send_message',
                    conversationId: 'nonexistent',
                    content: 'Hello',
                },
                testClient,
            );
        } catch (e) {
            caughtError = e as Error;
        }

        if (caughtError) {
            throw caughtError;
        }

        expect(emitSpy).toHaveBeenCalledWith('error', {
            type: 'error',
            conversationId: 'nonexistent',
            code: 'CONVERSATION_NOT_FOUND',
            message: expect.any(String),
        });
    });
});
