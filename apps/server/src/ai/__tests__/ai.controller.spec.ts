/**
 * AiController tests
 *
 * Verifies that POST /ai/chat delegates to RequestDispatcher (not AiService)
 * and creates a room when none is provided.
 */

import { Test, type TestingModule } from '@nestjs/testing';
import { AiController } from '../ai.controller';
import { RoomService } from '../conversation/room.service';
import type { DispatchContext } from '../dispatch/request-dispatcher';
import { RequestDispatcher } from '../dispatch/request-dispatcher';
import { ProviderRegistry } from '../llm/provider-registry';
import { MessageService } from '../message/message.service';

describe('AiController', () => {
    let controller: AiController;
    let requestDispatcher: RequestDispatcher;
    let roomService: RoomService;

    const mockRoom = {
        id: 'room-1',
        userId: null,
        title: null,
        model: null,
        provider: null,
        status: 'active',
        messageCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
    };

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            controllers: [AiController],
            providers: [
                {
                    provide: RequestDispatcher,
                    useValue: { dispatch: jest.fn().mockResolvedValue(undefined) },
                },
                {
                    provide: RoomService,
                    useValue: {
                        create: jest.fn().mockResolvedValue(mockRoom),
                        findById: jest.fn().mockResolvedValue(mockRoom),
                    },
                },
                {
                    provide: MessageService,
                    useValue: {},
                },
                {
                    provide: ProviderRegistry,
                    useValue: { defaultConfig: undefined },
                },
            ],
        }).compile();

        controller = module.get(AiController);
        requestDispatcher = module.get(RequestDispatcher);
        roomService = module.get(RoomService);
    });

    describe('POST /ai/chat', () => {
        it('should create a room when no roomId is provided', async () => {
            const result = await controller.sendMessage({
                content: 'Hello, world!',
            } as any);

            expect(roomService.create).toHaveBeenCalled();
            expect(requestDispatcher.dispatch).toHaveBeenCalled();
            expect(result.success).toBe(true);
            expect(result.roomId).toBe('room-1');
        });

        it('should use provided roomId without creating a new one', async () => {
            (roomService.findById as jest.Mock).mockResolvedValue(mockRoom);

            const result = await controller.sendMessage({
                roomId: 'existing-room',
                content: 'Hello!',
            } as any);

            expect(roomService.create).not.toHaveBeenCalled();
            expect(requestDispatcher.dispatch).toHaveBeenCalledWith(
                expect.objectContaining({
                    roomId: 'existing-room',
                    content: 'Hello!',
                }),
            );
            expect(result.success).toBe(true);
            expect(result.roomId).toBe('existing-room');
        });

        it('should pass context to RequestDispatcher when provided', async () => {
            const ctx = { source: 'web' };

            await controller.sendMessage({
                roomId: 'room-1',
                content: 'Test',
                context: ctx,
            } as any);

            const dispatchCtx = (requestDispatcher.dispatch as jest.Mock).mock
                .calls[0][0] as DispatchContext;
            expect(dispatchCtx.context).toEqual(ctx);
        });

        it('should use a synthetic clientId for REST dispatch', async () => {
            await controller.sendMessage({
                roomId: 'room-1',
                content: 'Test',
            } as any);

            const dispatchCtx = (requestDispatcher.dispatch as jest.Mock).mock
                .calls[0][0] as DispatchContext;
            expect(dispatchCtx.clientId).toBeDefined();
            expect(typeof dispatchCtx.clientId).toBe('string');
        });
    });
});
