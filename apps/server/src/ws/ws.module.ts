import { Module } from '@nestjs/common';
import { MessageBus } from './message-bus';
import { SocketRegistry } from './socket-registry';
import { WsGateway } from './ws-gateway';

@Module({
    providers: [WsGateway, SocketRegistry, MessageBus],
    exports: [SocketRegistry, MessageBus, WsGateway],
})
export class WsModule {}
