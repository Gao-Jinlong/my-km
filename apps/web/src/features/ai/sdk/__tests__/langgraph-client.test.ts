import { describe, expect, it } from 'vitest';
import { createLangGraphClient, withTraceparent } from '../langgraph-client';

describe('withTraceparent', () => {
    it('injects traceparent header when getter returns a value', () => {
        const middleware = withTraceparent(
            () => '00-0123456789abcdef0123456789abcdef-0123456789abcdef-01',
        );

        const init = middleware(new URL('http://localhost:3000/api/threads/t1/runs/stream'), {
            headers: { 'content-type': 'application/json' },
        }) as RequestInit;

        expect(new Headers(init.headers).get('traceparent')).toBe(
            '00-0123456789abcdef0123456789abcdef-0123456789abcdef-01',
        );
    });

    it('passes through unchanged when getter returns null', () => {
        const middleware = withTraceparent(() => null);

        const init = middleware(new URL('http://localhost:3000/api/threads/t1/runs/stream'), {
            headers: { 'content-type': 'application/json' },
        }) as RequestInit;

        expect(new Headers(init.headers).has('traceparent')).toBe(false);
    });
});

describe('createLangGraphClient', () => {
    it('creates a client with onRequest hook', () => {
        const client = createLangGraphClient({
            onRequest: withTraceparent(() => '00-abc-def-01'),
        });

        expect(client).toBeDefined();
    });

    it('creates a bare client without onRequest', () => {
        const client = createLangGraphClient();
        expect(client).toBeDefined();
    });
});
