import { extractLastUserMessage, toRunDto } from '../run-dto.mapper';

describe('extractLastUserMessage', () => {
    it('returns content of last human message', () => {
        const messages = [
            { type: 'human', content: 'first' },
            { type: 'ai', content: 'hi' },
            { type: 'human', content: 'second' },
        ];
        expect(extractLastUserMessage(messages)).toBe('second');
    });

    it('returns null when no human message', () => {
        const messages = [
            { type: 'ai', content: 'hi' },
            { type: 'system', content: 'sys' },
        ];
        expect(extractLastUserMessage(messages)).toBeNull();
    });

    it('returns null for empty array', () => {
        expect(extractLastUserMessage([])).toBeNull();
    });

    it('skips ai messages after the last human', () => {
        const messages = [
            { type: 'human', content: 'q' },
            { type: 'ai', content: 'a1' },
            { type: 'ai', content: 'a2' },
        ];
        expect(extractLastUserMessage(messages)).toBe('q');
    });
});

describe('toRunDto', () => {
    const prismaRun = {
        id: 'run-1',
        threadId: 'thread-1',
        status: 'completed',
        model: 'gpt-4',
        provider: 'openai',
        promptTokens: 10,
        completionTokens: 20,
        totalTokens: 30,
        startedAt: new Date('2026-01-01T00:00:00Z'),
        completedAt: new Date('2026-01-01T00:01:00Z'),
        createdAt: new Date('2026-01-01T00:00:00Z'),
    };

    it('maps id, threadId, status', () => {
        const dto = toRunDto(prismaRun);
        expect(dto.id).toBe('run-1');
        expect(dto.threadId).toBe('thread-1');
        expect(dto.status).toBe('completed');
    });

    it('maps token counts', () => {
        const dto = toRunDto(prismaRun);
        expect(dto.promptTokens).toBe(10);
        expect(dto.completionTokens).toBe(20);
        expect(dto.totalTokens).toBe(30);
    });

    it('serializes startedAt/completedAt/createdAt to ISO strings', () => {
        const dto = toRunDto(prismaRun);
        expect(dto.startedAt).toBe('2026-01-01T00:00:00.000Z');
        expect(dto.completedAt).toBe('2026-01-01T00:01:00.000Z');
        expect(dto.createdAt).toBe('2026-01-01T00:00:00.000Z');
    });

    it('coerces null model/provider to undefined', () => {
        const dto = toRunDto({ ...prismaRun, model: null, provider: null });
        expect(dto.model).toBeUndefined();
        expect(dto.provider).toBeUndefined();
    });

    it('coerces null startedAt/completedAt to undefined', () => {
        const dto = toRunDto({ ...prismaRun, startedAt: null, completedAt: null });
        expect(dto.startedAt).toBeUndefined();
        expect(dto.completedAt).toBeUndefined();
    });
});
