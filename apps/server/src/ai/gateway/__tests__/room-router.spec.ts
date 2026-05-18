import { Test } from '@nestjs/testing';
import { RoomService } from '../../conversation/room.service';
import { RequestDispatcher } from '../../dispatch/request-dispatcher';
import { MessageService } from '../../message/message.service';
import { RoomRouter } from '../room-router';
import type { RoomStateMachine } from '../room-statemachine';
import { RoomStateMachineFactory } from '../room-statemachine-factory';

describe('RoomRouter', () => {
    let roomRouter: RoomRouter;
    let roomService: jest.Mocked<RoomService>;
    let messageService: jest.Mocked<MessageService>;
    let requestDispatcher: jest.Mocked<RequestDispatcher>;
    let stateMachineFactory: jest.Mocked<RoomStateMachineFactory>;
    let emitCallback: jest.Mock;

    beforeEach(async () => {
        emitCallback = jest.fn();

        roomService = {
            create: jest.fn(),
            findById: jest.fn(),
        } as any;

        messageService = {
            findByRoomId: jest.fn(),
        } as any;

        requestDispatcher = {
            dispatch: jest.fn(),
        } as any;

        stateMachineFactory = {
            create: jest.fn(),
            get: jest.fn(),
            destroy: jest.fn(),
            destroyByClientId: jest.fn(),
        } as any;

        const module = await Test.createTestingModule({
            providers: [
                RoomRouter,
                { provide: RoomService, useValue: roomService },
                { provide: MessageService, useValue: messageService },
                { provide: RequestDispatcher, useValue: requestDispatcher },
                { provide: RoomStateMachineFactory, useValue: stateMachineFactory },
            ],
        }).compile();

        roomRouter = module.get(RoomRouter);
    });

    describe('createAndSend', () => {
        it('creates room, state machine, and dispatches', async () => {
            const newRoom = {
                id: 'room-1',
                title: 'test',
                userId: null,
                status: 'active',
                model: null,
                provider: null,
                messageCount: 0,
                createdAt: new Date(),
                updatedAt: new Date(),
            };
            roomService.create.mockResolvedValue(newRoom);

            await roomRouter.createAndSend('client-1', 'hello', undefined, emitCallback);

            expect(roomService.create).toHaveBeenCalledWith({
                title: 'hello'.substring(0, 50),
            });
            expect(stateMachineFactory.create).toHaveBeenCalledWith({
                roomId: 'room-1',
                clientId: 'client-1',
                emit: emitCallback,
            });
            expect(requestDispatcher.dispatch).toHaveBeenCalledWith({
                roomId: 'room-1',
                clientId: 'client-1',
                content: 'hello',
                context: undefined,
            });
        });
    });

    describe('sendMessage', () => {
        it('emits error if room not found', async () => {
            roomService.findById.mockResolvedValue(null);

            await roomRouter.sendMessage('client-1', 'nope', 'hello', undefined, emitCallback);

            expect(emitCallback).toHaveBeenCalledWith({
                type: 'error',
                roomId: 'nope',
                code: 'ROOM_NOT_FOUND',
                message: 'Room not found',
            });
        });

        it('creates state machine and dispatches for existing room', async () => {
            const room = {
                id: 'room-1',
                title: 'test',
                userId: null,
                status: 'active',
                model: null,
                provider: null,
                messageCount: 0,
                createdAt: new Date(),
                updatedAt: new Date(),
            };
            roomService.findById.mockResolvedValue(room);

            await roomRouter.sendMessage('client-1', 'room-1', 'hello', undefined, emitCallback);

            expect(stateMachineFactory.create).toHaveBeenCalledWith({
                roomId: 'room-1',
                clientId: 'client-1',
                emit: emitCallback,
            });
            expect(requestDispatcher.dispatch).toHaveBeenCalled();
        });
    });

    describe('joinRoom', () => {
        it('emits error if room not found', async () => {
            roomService.findById.mockResolvedValue(null);

            await roomRouter.joinRoom('nope', emitCallback);

            expect(emitCallback).toHaveBeenCalledWith(expect.objectContaining({ type: 'error' }));
        });

        it('loads and emits history for existing room', async () => {
            const room = {
                id: 'room-1',
                title: 'test',
                userId: null,
                status: 'active',
                model: null,
                provider: null,
                messageCount: 0,
                createdAt: new Date(),
                updatedAt: new Date(),
            };
            roomService.findById.mockResolvedValue(room);
            messageService.findByRoomId.mockResolvedValue([
                {
                    id: 'msg-1',
                    role: 'user',
                    content: 'hi',
                    toolCalls: null,
                    toolResultId: null,
                    tokenCount: null,
                    createdAt: new Date(),
                },
            ]);

            await roomRouter.joinRoom('room-1', emitCallback);

            expect(emitCallback).toHaveBeenCalledWith(expect.objectContaining({ type: 'history' }));
        });
    });

    describe('stop', () => {
        it('calls state machine stop', () => {
            const mockSM: Partial<RoomStateMachine> = { stop: jest.fn() };
            stateMachineFactory.get.mockReturnValue(mockSM as RoomStateMachine);

            roomRouter.stop('room-1');

            expect(stateMachineFactory.get).toHaveBeenCalledWith('room-1');
            expect(mockSM.stop).toHaveBeenCalled();
        });

        it('no-ops if no state machine exists', () => {
            stateMachineFactory.get.mockReturnValue(null);
            expect(() => roomRouter.stop('room-1')).not.toThrow();
        });
    });

    describe('onClientDisconnect', () => {
        it('calls destroyByClientId on the state machine factory', () => {
            roomRouter.onClientDisconnect('client-1');

            expect(stateMachineFactory.destroyByClientId).toHaveBeenCalledWith('client-1');
        });

        it('does not throw when no FSMs exist for client', () => {
            stateMachineFactory.destroyByClientId.mockImplementation(() => {});

            expect(() => {
                roomRouter.onClientDisconnect('unknown-client');
            }).not.toThrow();
        });
    });
});
