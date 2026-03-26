/**
 * 消息通道基础错误
 */
export class MessageChannelError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'MessageChannelError';
    }
}

/**
 * 通道未找到错误
 */
export class ChannelNotFoundError extends MessageChannelError {
    constructor(channelId: string) {
        super(`Channel "${channelId}" not found`);
        this.name = 'ChannelNotFoundError';
    }
}

/**
 * 通道已存在错误
 */
export class ChannelAlreadyExistsError extends MessageChannelError {
    constructor(channelId: string) {
        super(`Channel "${channelId}" already exists`);
        this.name = 'ChannelAlreadyExistsError';
    }
}

/**
 * 通道状态错误
 */
export class ChannelInvalidStateError extends MessageChannelError {
    constructor(channelId: string, state: string) {
        super(`Channel "${channelId}" is in invalid state: ${state}`);
        this.name = 'ChannelInvalidStateError';
    }
}

/**
 * 消息发送失败错误
 */
export class MessageSendError extends MessageChannelError {
    constructor(message: string) {
        super(`Failed to send message: ${message}`);
        this.name = 'MessageSendError';
    }
}
