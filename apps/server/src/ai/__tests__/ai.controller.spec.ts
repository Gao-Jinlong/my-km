/**
 * AiController tests
 *
 * Verifies that POST /ai/chat delegates to RequestDispatcher (not AiService)
 * and creates a conversation when none is provided.
 */

import { Test, type TestingModule } from '@nestjs/testing';
import { AiController } from '../ai.controller';
import { ConversationService } from '../conversation/conversation.service';
import type { DispatchContext } from '../dispatch/request-dispatcher';
import { RequestDispatcher } from '../dispatch/request-dispatcher';
import { MessageService } from '../message/message.service';

describe('AiController', () => {
    let controller: AiController;
    let requestDispatcher: RequestDispatcher;
    let conversationService: ConversationService;

    const mockConversation = {
        id: 'conv-1',
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
                    provide: ConversationService,
                    useValue: {
                        create: jest.fn().mockResolvedValue(mockConversation),
                        findById: jest.fn().mockResolvedValue(mockConversation),
                    },
                },
                {
                    provide: MessageService,
                    useValue: {},
                },
            ],
        }).compile();

        controller = module.get(AiController);
        requestDispatcher = module.get(RequestDispatcher);
        conversationService = module.get(ConversationService);
    });

    describe('POST /ai/chat', () => {
        it('should create a conversation when no conversationId is provided', async () => {
            const result = await controller.sendMessage({
                content: 'Hello, world!',
            } as any);

            expect(conversationService.create).toHaveBeenCalled();
            expect(requestDispatcher.dispatch).toHaveBeenCalled();
            expect(result.success).toBe(true);
            expect(result.conversationId).toBe('conv-1');
        });

        it('should use provided conversationId without creating a new one', async () => {
            (conversationService.findById as jest.Mock).mockResolvedValue(mockConversation);

            const result = await controller.sendMessage({
                conversationId: 'existing-conv',
                content: 'Hello!',
            } as any);

            expect(conversationService.create).not.toHaveBeenCalled();
            expect(requestDispatcher.dispatch).toHaveBeenCalledWith(
                expect.objectContaining({
                    conversationId: 'existing-conv',
                    content: 'Hello!',
                }),
            );
            expect(result.success).toBe(true);
            expect(result.conversationId).toBe('existing-conv');
        });

        it('should pass context to RequestDispatcher when provided', async () => {
            const ctx = { source: 'web' };

            await controller.sendMessage({
                conversationId: 'conv-1',
                content: 'Test',
                context: ctx,
            } as any);

            const dispatchCtx = (requestDispatcher.dispatch as jest.Mock).mock
                .calls[0][0] as DispatchContext;
            expect(dispatchCtx.context).toEqual(ctx);
        });

        it('should use a synthetic clientId for REST dispatch', async () => {
            await controller.sendMessage({
                conversationId: 'conv-1',
                content: 'Test',
            } as any);

            const dispatchCtx = (requestDispatcher.dispatch as jest.Mock).mock
                .calls[0][0] as DispatchContext;
            expect(dispatchCtx.clientId).toBeDefined();
            expect(typeof dispatchCtx.clientId).toBe('string');
        });
    });
});
