// apps/web/src/platform/event-bus/index.ts

// 错误
export {
    EventBusError,
    EventInterceptorError,
    EventNotRegisteredError,
    EventTypeConflictError,
} from './errors';
// 服务
export { EventBusService } from './service';
// 类型
export type {
    EventDefinition,
    EventHistoryOptions,
    EventInterceptor,
    EventSubscriptionOptions,
} from './types';

// 预定义事件
export { EditorEvents, FileSystemEvents, SystemEvents } from './types';
