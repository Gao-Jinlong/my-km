import { Module } from '@nestjs/common';
import { SocketRegistry } from './socket-registry';
import { WsGateway } from './ws-gateway';

@Module({
    providers: [WsGateway, SocketRegistry],
    exports: [SocketRegistry],
})
export class WsModule {}
