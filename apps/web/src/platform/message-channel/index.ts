// apps/web/src/platform/message-channel/index.ts

// 错误
export {
    ChannelAlreadyExistsError,
    ChannelInvalidStateError,
    ChannelNotFoundError,
    MessageChannelError,
    MessageSendError,
} from './errors';
export { MessageChannelService } from './service';
export type {
    IMessageChannel,
    Message,
    MessageChannelConfig,
    MessageChannelEvents,
    MessageChannelOptions,
    MessageHandler,
    MessageInterceptor,
    WorkerMessage,
} from './types';
export { MessageChannelState } from './types';
