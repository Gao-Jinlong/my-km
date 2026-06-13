import { shouldIgnoreIncomingTracingRequest } from '../tracing.init';

describe('shouldIgnoreIncomingTracingRequest', () => {
    it('ignores trace query endpoints', () => {
        expect(shouldIgnoreIncomingTracingRequest('/api/traces')).toBe(true);
        expect(
            shouldIgnoreIncomingTracingRequest('/api/traces/a510f3983164aa84cbfde4b7ceaa174a'),
        ).toBe(true);
        expect(shouldIgnoreIncomingTracingRequest('/api/traces/stats')).toBe(true);
    });

    it('ignores browser span ingestion endpoint', () => {
        expect(shouldIgnoreIncomingTracingRequest('/api/traces/spans')).toBe(true);
    });

    it('keeps chat stream endpoints traceable', () => {
        expect(shouldIgnoreIncomingTracingRequest('/api/threads/thread-1/runs/stream')).toBe(false);
    });
});
