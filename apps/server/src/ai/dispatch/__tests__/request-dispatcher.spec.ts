/**
 * RequestDispatcher tests
 *
 * Verifies that RequestDispatcher uses SocketRegistry.emitToClient
 * for error emission (rate limit and dispatch errors).
 */

import { Test } from '@nestjs/testing';
import { SocketRegistry } from '../../../ws/socket-registry';
import { ConversationService } from '../../conversation/conversation.service';
import { AISessionManager } from '../../session/ai-session-manager';
import { ConversationOrchestrator } from '../../workflow-runtime/conversation-orchestrator';
import { AiRateLimiter } from '../rate-limiter.guard';
import { RequestDispatcher } from '../request-dispatcher';

describe('RequestDispatcher', () => {
    let dispatcher: RequestDispatcher;
    let socketRegistry: SocketRegistry;
    let rateLimiter: AiRateLimiter;
    let orchestrator: ConversationOrchestrator;

    beforeEach(async () => {
        const module = await Test.createTestingModule({
            providers: [
                RequestDispatcher,
                {
                    provide: AISessionManager,
                    useValue: {
                        create: jest.fn().mockReturnValue({
                            id: 'session-1',
                            conversationId: 'conv-1',
                            clientId: 'client-1',
                            status: 'active',
                        }),
                        cleanup: jest.fn(),
                    },
                },
                {
                    provide: ConversationOrchestrator,
                    useValue: { dispatch: jest.fn().mockResolvedValue(undefined) },
                },
                {
                    provide: SocketRegistry,
                    useValue: { emitToClient: jest.fn() },
                },
                {
                    provide: ConversationService,
                    useValue: {
                        findById: jest.fn().mockResolvedValue({ id: 'conv-1', userId: 'user-1' }),
                    },
                },
                {
                    provide: AiRateLimiter,
                    useValue: { check: jest.fn().mockReturnValue(true) },
                },
            ],
        }).compile();

        dispatcher = module.get(RequestDispatcher);
        socketRegistry = module.get(SocketRegistry);
        rateLimiter = module.get(AiRateLimiter);
        orchestrator = module.get(ConversationOrchestrator);
    });

    it('should dispatch successfully', async () => {
        await dispatcher.dispatch({
            conversationId: 'conv-1',
            clientId: 'client-1',
            content: 'Hello',
        });

        expect(orchestrator.dispatch).toHaveBeenCalled();
        expect(socketRegistry.emitToClient).not.toHaveBeenCalled();
    });

    it('should emit error via SocketRegistry.emitToClient when rate limited', async () => {
        (rateLimiter.check as jest.Mock).mockReturnValue(false);

        await dispatcher.dispatch({
            conversationId: 'conv-1',
            clientId: 'client-1',
            content: 'Hello',
        });

        expect(socketRegistry.emitToClient).toHaveBeenCalledWith('client-1', 'error', {
            type: 'error',
            message: 'Rate limit exceeded. Please try again later.',
            code: 'RATE_LIMITED',
        });
        expect(orchestrator.dispatch).not.toHaveBeenCalled();
    });

    it('should emit error via SocketRegistry.emitToClient on dispatch failure', async () => {
        const errorMsg = 'LLM provider error';
        (orchestrator.dispatch as jest.Mock).mockRejectedValue(new Error(errorMsg));

        await dispatcher.dispatch({
            conversationId: 'conv-1',
            clientId: 'client-1',
            content: 'Hello',
        });

        expect(socketRegistry.emitToClient).toHaveBeenCalledWith('client-1', 'error', {
            type: 'error',
            message: errorMsg,
            code: 'DISPATCH_ERROR',
        });
    });
});
