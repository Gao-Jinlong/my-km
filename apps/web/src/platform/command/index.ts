// apps/web/src/platform/command/index.ts

// 服务
export { CommandService } from './service';

// 类型
export type {
    CommandContext,
    CommandDefinition,
    CommandDidExecuteEvent,
    CommandFailedEvent,
    CommandHandler,
    CommandHistoryItem,
    CommandInterceptor,
    CommandMetadata,
    CommandWillExecuteEvent,
    ICommandService,
} from './types';
