// apps/web/src/platform/command/index.ts

// 预定义命令
export {
    EditorCommands,
    FileCommands,
    ViewCommands,
} from './commands';
// 错误
export {
    CommandCenterError,
    CommandExecutionError,
    CommandNotAvailableError,
    CommandNotImplementedError,
    CommandNotRegisteredError,
} from './errors';
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
