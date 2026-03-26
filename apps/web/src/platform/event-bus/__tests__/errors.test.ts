// apps/web/src/platform/event-bus/__tests__/errors.test.ts
import { describe, expect, it } from 'vitest';
import {
    EventBusError,
    EventInterceptorError,
    EventNotRegisteredError,
    EventTypeConflictError,
} from '../errors';

describe('EventBus Errors', () => {
    it('EventBusError 应有正确的 name', () => {
        const error = new EventBusError('test');
        expect(error.name).toBe('EventBusError');
    });

    it('EventNotRegisteredError 应包含事件类型', () => {
        const error = new EventNotRegisteredError('test.event');
        expect(error.message).toContain('test.event');
        expect(error.name).toBe('EventNotRegisteredError');
    });

    it('EventTypeConflictError 应包含冲突类型', () => {
        const error = new EventTypeConflictError('test.event');
        expect(error.message).toContain('test.event');
        expect(error.name).toBe('EventTypeConflictError');
    });

    it('EventInterceptorError 应包含拦截器名称', () => {
        const error = new EventInterceptorError('MyInterceptor', 'something went wrong');
        expect(error.message).toContain('MyInterceptor');
        expect(error.message).toContain('something went wrong');
        expect(error.name).toBe('EventInterceptorError');
    });
});
