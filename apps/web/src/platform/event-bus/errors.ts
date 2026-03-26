/**
 * 事件总线基础错误
 */
export class EventBusError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'EventBusError';
    }
}

/**
 * 事件未注册错误
 */
export class EventNotRegisteredError extends EventBusError {
    constructor(eventType: string) {
        super(`Event "${eventType}" is not registered`);
        this.name = 'EventNotRegisteredError';
    }
}

/**
 * 事件类型冲突错误
 */
export class EventTypeConflictError extends EventBusError {
    constructor(eventType: string) {
        super(`Event type "${eventType}" already registered with different definition`);
        this.name = 'EventTypeConflictError';
    }
}

/**
 * 事件拦截器错误
 */
export class EventInterceptorError extends EventBusError {
    constructor(interceptorName: string, message: string) {
        super(`Interceptor "${interceptorName}" error: ${message}`);
        this.name = 'EventInterceptorError';
    }
}
