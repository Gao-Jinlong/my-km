import { Test } from '@nestjs/testing';
import { RoomRouter } from '../../ai/gateway/room-router';
import { ToolDispatcher } from '../../ai/tools/tool.dispatcher';
import { SocketRegistry } from '../socket-registry';
import { WsGateway } from '../ws-gateway';

describe('WsGateway', () => {
    let gateway: WsGateway;
    let registry: jest.Mocked<SocketRegistry>;
    let roomRouter: jest.Mocked<RoomRouter>;
    let toolDispatcher: jest.Mocked<ToolDispatcher>;

    beforeEach(async () => {
        registry = {
            register: jest.fn(),
            unregister: jest.fn(),
            emitToClient: jest.fn(),
        } as any;

        roomRouter = {
            createAndSend: jest.fn(),
            sendMessage: jest.fn(),
            joinRoom: jest.fn(),
            stop: jest.fn(),
            onClientDisconnect: jest.fn(),
        } as any;

        toolDispatcher = {
            deliverResult: jest.fn(),
        } as any;

        const module = await Test.createTestingModule({
            providers: [
                WsGateway,
                { provide: SocketRegistry, useValue: registry },
                { provide: RoomRouter, useValue: roomRouter },
                { provide: ToolDispatcher, useValue: toolDispatcher },
            ],
        }).compile();

        gateway = module.get(WsGateway);
    });

    describe('handleDisconnect', () => {
        it('unregisters client from socket registry', () => {
            const mockSocket = { id: 'client-1' } as any;

            gateway.handleDisconnect(mockSocket);

            expect(registry.unregister).toHaveBeenCalledWith('client-1');
        });

        it('calls onClientDisconnect on roomRouter to clean up FSMs', () => {
            const mockSocket = { id: 'client-42' } as any;

            gateway.handleDisconnect(mockSocket);

            expect(roomRouter.onClientDisconnect).toHaveBeenCalledWith('client-42');
        });

        it('calls onClientDisconnect before unregister', () => {
            const callOrder: string[] = [];
            registry.unregister.mockImplementation(() => callOrder.push('unregister'));
            roomRouter.onClientDisconnect.mockImplementation(() =>
                callOrder.push('onClientDisconnect'),
            );

            const mockSocket = { id: 'client-1' } as any;
            gateway.handleDisconnect(mockSocket);

            // onClientDisconnect should be called before unregister
            expect(callOrder).toEqual(['onClientDisconnect', 'unregister']);
        });
    });
});
