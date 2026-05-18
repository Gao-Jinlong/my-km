import { Test } from '@nestjs/testing';
import { MessageBus } from '../message-bus';
import { SocketRegistry } from '../socket-registry';
import { WsGateway } from '../ws-gateway';

describe('WsGateway', () => {
    let gateway: WsGateway;
    let registry: jest.Mocked<SocketRegistry>;
    let messageBus: jest.Mocked<MessageBus>;

    beforeEach(async () => {
        registry = {
            register: jest.fn(),
            unregister: jest.fn(),
            emitToClient: jest.fn(),
            getSocket: jest.fn(),
            isOnline: jest.fn(),
        } as any;

        messageBus = {
            publish: jest.fn(),
            subscribe: jest.fn(),
        } as any;

        const module = await Test.createTestingModule({
            providers: [
                WsGateway,
                { provide: SocketRegistry, useValue: registry },
                { provide: MessageBus, useValue: messageBus },
            ],
        }).compile();

        gateway = module.get(WsGateway);
    });

    describe('handleConnection', () => {
        it('registers client in socket registry', () => {
            const mockSocket = { id: 'client-1' } as any;
            gateway.handleConnection(mockSocket);
            expect(registry.register).toHaveBeenCalledWith('client-1', mockSocket);
        });
    });

    describe('handleDisconnect', () => {
        it('publishes disconnect message to MessageBus', () => {
            const mockSocket = { id: 'client-42' } as any;
            gateway.handleDisconnect(mockSocket);
            expect(messageBus.publish).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: 'disconnect',
                    clientId: 'client-42',
                }),
            );
        });

        it('unregisters client from socket registry', () => {
            const mockSocket = { id: 'client-1' } as any;
            gateway.handleDisconnect(mockSocket);
            expect(registry.unregister).toHaveBeenCalledWith('client-1');
        });

        it('publishes disconnect before unregister', async () => {
            const callOrder: string[] = [];
            (messageBus.publish as jest.Mock).mockImplementation(async () => {
                callOrder.push('publish');
            });
            (registry.unregister as jest.Mock).mockImplementation(() =>
                callOrder.push('unregister'),
            );

            const mockSocket = { id: 'client-1' } as any;
            await gateway.handleDisconnect(mockSocket);

            expect(callOrder).toEqual(['publish', 'unregister']);
        });
    });

    describe('handleMessage (envelope)', () => {
        const mockSocket = { id: 'client-1' } as any;

        it('publishes valid envelope to MessageBus', async () => {
            await gateway.handleMessage(
                { type: 'create_and_send', payload: { content: 'hello', context: undefined } },
                mockSocket,
            );
            expect(messageBus.publish).toHaveBeenCalledWith({
                type: 'create_and_send',
                clientId: 'client-1',
                payload: { content: 'hello', context: undefined },
            });
        });

        it('publishes any business message type to MessageBus', async () => {
            await gateway.handleMessage(
                {
                    type: 'send_message',
                    payload: {
                        roomId: 'room-1',
                        content: 'hi',
                        context: undefined,
                    },
                },
                mockSocket,
            );
            expect(messageBus.publish).toHaveBeenCalledWith({
                type: 'send_message',
                clientId: 'client-1',
                payload: {
                    roomId: 'room-1',
                    content: 'hi',
                    context: undefined,
                },
            });
        });

        it('publishes join message to MessageBus', async () => {
            await gateway.handleMessage(
                { type: 'join', payload: { roomId: 'room-1' } },
                mockSocket,
            );
            expect(messageBus.publish).toHaveBeenCalledWith({
                type: 'join',
                clientId: 'client-1',
                payload: { roomId: 'room-1' },
            });
        });

        it('publishes stop message to MessageBus', async () => {
            await gateway.handleMessage(
                { type: 'stop', payload: { roomId: 'room-1' } },
                mockSocket,
            );
            expect(messageBus.publish).toHaveBeenCalledWith({
                type: 'stop',
                clientId: 'client-1',
                payload: { roomId: 'room-1' },
            });
        });

        it('publishes tool_result message to MessageBus', async () => {
            await gateway.handleMessage(
                {
                    type: 'tool_result',
                    payload: {
                        roomId: 'room-1',
                        toolCallId: 'tc-1',
                        result: { data: 42 },
                    },
                },
                mockSocket,
            );
            expect(messageBus.publish).toHaveBeenCalledWith({
                type: 'tool_result',
                clientId: 'client-1',
                payload: {
                    roomId: 'room-1',
                    toolCallId: 'tc-1',
                    result: { data: 42 },
                },
            });
        });

        it('ignores message with missing type', async () => {
            await gateway.handleMessage({ payload: { content: 'hello' } }, mockSocket);
            expect(messageBus.publish).not.toHaveBeenCalled();
        });

        it('ignores message with empty string type', async () => {
            await gateway.handleMessage({ type: '', payload: { content: 'hello' } }, mockSocket);
            expect(messageBus.publish).not.toHaveBeenCalled();
        });

        it('ignores message with non-string type', async () => {
            await gateway.handleMessage({ type: 42 as unknown as string, payload: {} }, mockSocket);
            expect(messageBus.publish).not.toHaveBeenCalled();
        });

        it('defaults payload to empty object when missing', async () => {
            await gateway.handleMessage({ type: 'some_event' }, mockSocket);
            expect(messageBus.publish).toHaveBeenCalledWith({
                type: 'some_event',
                clientId: 'client-1',
                payload: {},
            });
        });
    });
});
