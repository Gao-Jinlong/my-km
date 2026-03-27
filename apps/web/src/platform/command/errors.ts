/**
 * 命令中心基础错误
 */
export class CommandCenterError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'CommandCenterError';
    }
}

/**
 * 命令未注册错误
 */
export class CommandNotRegisteredError extends CommandCenterError {
    constructor(commandId: string) {
        super(`Command "${commandId}" is not registered`);
        this.name = 'CommandNotRegisteredError';
    }
}

/**
 * 命令不可用错误
 */
export class CommandNotAvailableError extends CommandCenterError {
    constructor(commandId: string, reason?: string) {
        super(`Command "${commandId}" is not available${reason ? `: ${reason}` : ''}`);
        this.name = 'CommandNotAvailableError';
    }
}

/**
 * 命令执行失败错误
 */
export class CommandExecutionError extends CommandCenterError {
    public cause: Error;

    constructor(commandId: string, cause: Error) {
        super(`Command "${commandId}" execution failed: ${cause.message}`);
        this.name = 'CommandExecutionError';
        this.cause = cause;
    }
}

/**
 * 命令未实现错误（不支持 Undo/Redo）
 */
export class CommandNotImplementedError extends CommandCenterError {
    constructor(commandId: string, operation: 'undo' | 'redo') {
        super(`Command "${commandId}" does not support ${operation}`);
        this.name = 'CommandNotImplementedError';
    }
}
