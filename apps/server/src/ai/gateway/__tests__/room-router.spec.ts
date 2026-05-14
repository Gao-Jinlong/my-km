import { Test } from '@nestjs/testing';
import { ConversationService } from '../../conversation/conversation.service';
import { RequestDispatcher } from '../../dispatch/request-dispatcher';
import { MessageService } from '../../message/message.service';
import { RoomRouter } from '../room-router';
import type { RoomStateMachine } from '../room-statemachine';
import { RoomStateMachineFactory } from '../room-statemachine-factory';

describe('RoomRouter', () => {
    let roomRouter: RoomRouter;
    let conversationService: jest.Mocked<ConversationService>;
    let messageService: jest.Mocked<MessageService>;
    let requestDispatcher: jest.Mocked<RequestDispatcher>;
    let stateMachineFactory: jest.Mocked<RoomStateMachineFactory>;
    let emitCallback: jest.Mock;

    beforeEach(async () => {
        emitCallback = jest.fn();

        conversationService = {
            create: jest.fn(),
            findById: jest.fn(),
        } as any;

        messageService = {
            findByConversationId: jest.fn(),
        } as any;

        requestDispatcher = {
            dispatch: jest.fn(),
        } as any;

        stateMachineFactory = {
            create: jest.fn(),
            get: jest.fn(),
            destroy: jest.fn(),
        } as any;

        const module = await Test.createTestingModule({
            providers: [
                RoomRouter,
                { provide: ConversationService, useValue: conversationService },
                { provide: MessageService, useValue: messageService },
                { provide: RequestDispatcher, useValue: requestDispatcher },
                { provide: RoomStateMachineFactory, useValue: stateMachineFactory },
            ],
        }).compile();

        roomRouter = module.get(RoomRouter);
    });

    describe('createAndSend', () => {
        it('creates conversation, state machine, and dispatches', async () => {
            const newConv = {
                id: 'conv-1',
                title: 'test',
                userId: null,
                createdAt: new Date(),
                updatedAt: new Date(),
            };
            conversationService.create.mockResolvedValue(newConv);

            await roomRouter.createAndSend('client-1', 'hello', undefined, emitCallback);

            expect(conversationService.create).toHaveBeenCalledWith({
                title: 'hello'.substring(0, 50),
            });
            expect(stateMachineFactory.create).toHaveBeenCalledWith({
                conversationId: 'conv-1',
                clientId: 'client-1',
                emit: emitCallback,
            });
            expect(requestDispatcher.dispatch).toHaveBeenCalledWith({
                conversationId: 'conv-1',
                clientId: 'client-1',
                content: 'hello',
                context: undefined,
            });
        });
    });

    describe('sendMessage', () => {
        it('emits error if conversation not found', async () => {
            conversationService.findById.mockResolvedValue(null);

            await roomRouter.sendMessage('client-1', 'nope', 'hello', undefined, emitCallback);

            expect(emitCallback).toHaveBeenCalledWith({
                type: 'error',
                conversationId: 'nope',
                code: 'CONVERSATION_NOT_FOUND',
                message: 'Conversation not found',
            });
        });

        it('creates state machine and dispatches for existing conversation', async () => {
            const conv = { id: 'conv-1', title: 'test', userId: null };
            conversationService.findById.mockResolvedValue(conv);

            await roomRouter.sendMessage('client-1', 'conv-1', 'hello', undefined, emitCallback);

            expect(stateMachineFactory.create).toHaveBeenCalledWith({
                conversationId: 'conv-1',
                clientId: 'client-1',
                emit: emitCallback,
            });
            expect(requestDispatcher.dispatch).toHaveBeenCalled();
        });
    });

    describe('joinRoom', () => {
        it('emits error if conversation not found', async () => {
            conversationService.findById.mockResolvedValue(null);

            await roomRouter.joinRoom('nope', emitCallback);

            expect(emitCallback).toHaveBeenCalledWith(expect.objectContaining({ type: 'error' }));
        });

        it('loads and emits history for existing conversation', async () => {
            const conv = { id: 'conv-1', title: 'test', userId: null };
            conversationService.findById.mockResolvedValue(conv);
            messageService.findByConversationId.mockResolvedValue([
                {
                    id: 'msg-1',
                    role: 'user',
                    content: 'hi',
                    createdAt: new Date(),
                },
            ]);

            await roomRouter.joinRoom('conv-1', emitCallback);

            expect(emitCallback).toHaveBeenCalledWith(expect.objectContaining({ type: 'history' }));
        });
    });

    describe('stop', () => {
        it('calls state machine stop', () => {
            const mockSM: Partial<RoomStateMachine> = { stop: jest.fn() };
            stateMachineFactory.get.mockReturnValue(mockSM as RoomStateMachine);

            roomRouter.stop('conv-1');

            expect(stateMachineFactory.get).toHaveBeenCalledWith('conv-1');
            expect(mockSM.stop).toHaveBeenCalled();
        });

        it('no-ops if no state machine exists', () => {
            stateMachineFactory.get.mockReturnValue(null);
            expect(() => roomRouter.stop('conv-1')).not.toThrow();
        });
    });
});
