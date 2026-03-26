import { describe, expect, it } from 'vitest';
import {
    ChannelAlreadyExistsError,
    ChannelInvalidStateError,
    ChannelNotFoundError,
    MessageChannelError,
    MessageSendError,
} from '../errors';

describe('MessageChannel Errors', () => {
    it('MessageChannelError 应有正确的 name', () => {
        const error = new MessageChannelError('test');
        expect(error.name).toBe('MessageChannelError');
    });

    it('ChannelNotFoundError 应包含通道 ID', () => {
        const error = new ChannelNotFoundError('test-channel');
        expect(error.message).toContain('test-channel');
        expect(error.name).toBe('ChannelNotFoundError');
    });

    it('ChannelAlreadyExistsError 应包含通道 ID', () => {
        const error = new ChannelAlreadyExistsError('test-channel');
        expect(error.message).toContain('test-channel');
        expect(error.name).toBe('ChannelAlreadyExistsError');
    });

    it('ChannelInvalidStateError 应包含状态信息', () => {
        const error = new ChannelInvalidStateError('test-channel', 'closed');
        expect(error.message).toContain('test-channel');
        expect(error.message).toContain('closed');
        expect(error.name).toBe('ChannelInvalidStateError');
    });

    it('MessageSendError 应包含消息', () => {
        const error = new MessageSendError('network error');
        expect(error.message).toContain('network error');
        expect(error.name).toBe('MessageSendError');
    });
});
