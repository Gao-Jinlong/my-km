import { describe, expect, it } from 'vitest';
import 'reflect-metadata';
import { getContainer } from '@/platform/bootstrap';
import { TracingService } from '@/platform/tracing';
import { createLangGraphRequestHook } from '../langgraph-client';

describe('langgraphClient tracing', () => {
    it('adds active traceparent to outgoing request headers', () => {
        const tracing = getContainer().get(TracingService);
        tracing.setActiveTraceparent('00-0123456789abcdef0123456789abcdef-0123456789abcdef-01');
        const hook = createLangGraphRequestHook();

        const init = hook(new URL('http://localhost:3000/api/threads/t1/runs/stream'), {
            headers: { 'content-type': 'application/json' },
        });

        expect(new Headers(init.headers).get('traceparent')).toBe(
            '00-0123456789abcdef0123456789abcdef-0123456789abcdef-01',
        );
    });

    it('does not add traceparent when no active trace exists', () => {
        const tracing = getContainer().get(TracingService);
        tracing.setActiveTraceparent(null);
        const hook = createLangGraphRequestHook();

        const init = hook(new URL('http://localhost:3000/api/threads/t1/runs/stream'), {
            headers: { 'content-type': 'application/json' },
        });

        expect(new Headers(init.headers).has('traceparent')).toBe(false);
    });
});
