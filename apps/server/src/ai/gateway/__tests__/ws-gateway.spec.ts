import { Test } from '@nestjs/testing';
import type { Socket } from 'socket.io';
import { MessageBus } from '../../../ws/message-bus';
import { SocketRegistry } from '../../../ws/socket-registry';
import { WsGateway } from '../../../ws/ws-gateway';
import { ClientMessageType, TransportMessageType } from '../ai-ws-events.types';

describe('WsGateway (integration)', () => {
    let gateway: WsGateway;
    let registry: SocketRegistry;
    let messageBus: MessageBus;
    let mockSocket: Partial<Socket>;

    beforeEach(async () => {
        const module = await Test.createTestingModule({
            providers: [WsGateway, SocketRegistry, MessageBus],
        }).compile();

        gateway = module.get(WsGateway);
        registry = module.get(SocketRegistry);
        messageBus = module.get(MessageBus);
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

    it('publishes envelope message to MessageBus', async () => {
        const publishSpy = jest.spyOn(messageBus, 'publish');
        const mockClient = mockSocket as Socket;
        await gateway.handleMessage(
            {
                type: ClientMessageType.CreateAndSend,
                payload: { content: 'hello', context: undefined },
            },
            mockClient,
        );
        expect(publishSpy).toHaveBeenCalledWith(
            expect.objectContaining({
                type: ClientMessageType.CreateAndSend,
                clientId: 'test-sock',
            }),
        );
    });

    it('publishes tool_result envelope to MessageBus', async () => {
        const publishSpy = jest.spyOn(messageBus, 'publish');
        const mockClient = mockSocket as Socket;
        await gateway.handleMessage(
            {
                type: ClientMessageType.ToolResult,
                payload: {
                    roomId: 'room-1',
                    toolCallId: 'tc-1',
                    result: 'ok',
                },
            },
            mockClient,
        );
        expect(publishSpy).toHaveBeenCalledWith(
            expect.objectContaining({
                type: ClientMessageType.ToolResult,
                clientId: 'test-sock',
            }),
        );
    });
});
