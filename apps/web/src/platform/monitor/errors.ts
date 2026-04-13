// apps/web/src/platform/logger/errors.ts

export class LoggerError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'LoggerError';
    }
}

export class LoggerNotInitializedError extends LoggerError {
    constructor() {
        super('日志服务未初始化');
        this.name = 'LoggerNotInitializedError';
    }
}
