import { Test } from '@nestjs/testing';
import type { Socket } from 'socket.io';
import { SocketRegistry } from '../../../ws/socket-registry';
import { WsGateway } from '../../../ws/ws-gateway';
import { ToolDispatcher } from '../../tools/tool.dispatcher';
import { RoomRouter } from '../room-router';

describe('WsGateway', () => {
    let gateway: WsGateway;
    let registry: SocketRegistry;
    let roomRouter: jest.Mocked<RoomRouter>;
    let toolDispatcher: jest.Mocked<ToolDispatcher>;
    let mockSocket: Partial<Socket>;

    beforeEach(async () => {
        roomRouter = {
            createAndSend: jest.fn(),
            sendMessage: jest.fn(),
            joinRoom: jest.fn(),
            stop: jest.fn(),
        } as any;

        toolDispatcher = {
            deliverResult: jest.fn(),
        } as any;

        const module = await Test.createTestingModule({
            providers: [
                WsGateway,
                SocketRegistry,
                { provide: RoomRouter, useValue: roomRouter },
                { provide: ToolDispatcher, useValue: toolDispatcher },
            ],
        }).compile();

        gateway = module.get(WsGateway);
        registry = module.get(SocketRegistry);
        mockSocket = { id: 'test-sock', emit: jest.fn() };
    });

    it('registers socket on connection', () => {
        gateway.handleConnection(mockSocket as Socket);
        expect(registry.getSocket('test-sock')).toBe(mockSocket);
    });

    it('unregisters socket on disconnect', () => {
        gateway.handleConnection(mockSocket as Socket);
        gateway.handleDisconnect(mockSocket as Socket);
        expect(registry.getSocket('test-sock')).toBeNull();
    });

    it('routes create_and_send to roomRouter', async () => {
        const mockClient = mockSocket as Socket;
        await gateway.handleCreateAndSend(
            { type: 'create_and_send', content: 'hello', context: undefined },
            mockClient,
        );
        expect(roomRouter.createAndSend).toHaveBeenCalledWith(
            'test-sock',
            'hello',
            undefined,
            expect.any(Function),
        );
    });

    it('routes tool_result to toolDispatcher', async () => {
        const mockClient = mockSocket as Socket;
        await gateway.handleToolResult(
            {
                type: 'tool_result',
                conversationId: 'conv-1',
                toolCallId: 'tc-1',
                result: 'ok',
            },
            mockClient,
        );
        expect(toolDispatcher.deliverResult).toHaveBeenCalledWith('conv-1', 'tc-1', 'ok');
    });

    it('emits error on createAndSend failure', async () => {
        roomRouter.createAndSend.mockRejectedValue(new Error('boom'));
        const mockClient = mockSocket as Socket;
        gateway.handleConnection(mockClient);
        await gateway.handleCreateAndSend(
            { type: 'create_and_send', content: 'hello', context: undefined },
            mockClient,
        );
        expect(mockSocket.emit).toHaveBeenCalledWith(
            'error',
            expect.objectContaining({ type: 'error', code: 'LLM_UNAVAILABLE' }),
        );
    });
});
