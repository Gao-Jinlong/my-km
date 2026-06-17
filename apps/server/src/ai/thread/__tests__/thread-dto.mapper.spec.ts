import { toLangGraphThread, type ThreadLike } from '../thread-dto.mapper';

function sampleThread(overrides: Partial<ThreadLike> = {}): ThreadLike {
    return {
        id: 'thread-1',
        title: 'Hello',
        status: 'active',
        model: 'gpt-4',
        provider: 'openai',
        createdAt: new Date('2026-01-01T00:00:00Z'),
        updatedAt: new Date('2026-01-01T00:00:00Z'),
        ...overrides,
    };
}

describe('toLangGraphThread', () => {
    it('maps id → thread_id', () => {
        const result = toLangGraphThread(sampleThread());
        expect(result.thread_id).toBe('thread-1');
    });

    it('packs title/model/provider into metadata', () => {
        const result = toLangGraphThread(sampleThread());
        expect(result.metadata).toEqual({
            title: 'Hello',
            model: 'gpt-4',
            provider: 'openai',
        });
    });

    it('serializes timestamps to ISO strings', () => {
        const result = toLangGraphThread(sampleThread());
        expect(result.created_at).toBe('2026-01-01T00:00:00.000Z');
        expect(result.updated_at).toBe('2026-01-01T00:00:00.000Z');
    });

    it('always returns status idle (internal active maps to idle)', () => {
        const result = toLangGraphThread(sampleThread({ status: 'active' }));
        expect(result.status).toBe('idle');
    });

    it('returns empty values object', () => {
        const result = toLangGraphThread(sampleThread());
        expect(result.values).toEqual({});
    });

    it('preserves null model/provider in metadata', () => {
        const result = toLangGraphThread(sampleThread({ model: null, provider: null }));
        expect(result.metadata.model).toBeNull();
        expect(result.metadata.provider).toBeNull();
    });
});
