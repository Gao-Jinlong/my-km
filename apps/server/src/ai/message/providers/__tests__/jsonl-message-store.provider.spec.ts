import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { JsonlMessageStoreProvider } from '../jsonl-message-store.provider';

jest.mock('node:fs/promises');

const mockFs = fs as jest.Mocked<typeof fs>;

function makeProvider() {
    return new JsonlMessageStoreProvider({ dataDir: '/tmp/test-data' });
}

describe('JsonlMessageStoreProvider', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('should create and append a message record', async () => {
        mockFs.appendFile.mockResolvedValue(undefined);
        const now = new Date('2026-01-01T00:00:00Z');
        jest.spyOn(global.crypto, 'randomUUID').mockReturnValue(
            '00000000-0000-0000-0000-000000000001' as `${string}-${string}-${string}-${string}-${string}`,
        );
        jest.useFakeTimers();
        jest.setSystemTime(now);

        const provider = makeProvider();
        const result = await provider.create({
            roomId: 'room-1',
            role: 'user',
            content: 'Hello',
        });

        expect(result.id).toBe('00000000-0000-0000-0000-000000000001');
        expect(result.role).toBe('user');
        expect(result.content).toBe('Hello');
        expect(result.roomId).toBe('room-1');
        expect(result.createdAt).toEqual(now);
        expect(mockFs.appendFile).toHaveBeenCalledWith(
            expect.stringContaining('room-1.jsonl'),
            expect.stringContaining('"role":"user"'),
            'utf-8',
        );

        jest.useRealTimers();
    });

    it('should createMany by calling create for each record', async () => {
        mockFs.appendFile.mockResolvedValue(undefined);
        jest.spyOn(global.crypto, 'randomUUID')
            .mockReturnValueOnce(
                '00000000-0000-0000-0000-000000000001' as `${string}-${string}-${string}-${string}-${string}`,
            )
            .mockReturnValueOnce(
                '00000000-0000-0000-0000-000000000002' as `${string}-${string}-${string}-${string}-${string}`,
            );

        const provider = makeProvider();
        const results = await provider.createMany([
            { roomId: 'room-1', role: 'user', content: 'Hi' },
            { roomId: 'room-1', role: 'assistant', content: 'Hello' },
        ]);

        expect(results).toHaveLength(2);
        expect(results[0].id).toBe('00000000-0000-0000-0000-000000000001');
        expect(results[1].id).toBe('00000000-0000-0000-0000-000000000002');
    });

    it('should findByRoom return empty array when file does not exist', async () => {
        const enoent = new Error('ENOENT') as NodeJS.ErrnoException;
        enoent.code = 'ENOENT';
        mockFs.readFile.mockRejectedValue(enoent);

        const provider = makeProvider();
        const results = await provider.findByRoom('room-999');

        expect(results).toEqual([]);
    });

    it('should findByRoom parse valid JSONL content', async () => {
        const content =
            '{"id":"1","roomId":"room-1","role":"user","content":"Hi","createdAt":"2026-01-01T00:00:00.000Z"}\n' +
            '{"id":"2","roomId":"room-1","role":"assistant","content":"Hello","createdAt":"2026-01-01T00:01:00.000Z"}\n';
        mockFs.readFile.mockResolvedValue(content);

        const provider = makeProvider();
        const results = await provider.findByRoom('room-1');

        expect(results).toHaveLength(2);
        expect(results[0].role).toBe('user');
        expect(results[1].role).toBe('assistant');
    });

    it('should findByRoom skip invalid JSONL lines', async () => {
        const content =
            '{"id":"1","roomId":"room-1","role":"user","content":"Hi","createdAt":"2026-01-01T00:00:00.000Z"}\n' +
            'INVALID JSON LINE\n' +
            '{"id":"3","roomId":"room-1","role":"tool","content":"result","toolResultId":"tc-1","createdAt":"2026-01-01T00:02:00.000Z"}\n';
        mockFs.readFile.mockResolvedValue(content);

        const provider = makeProvider();
        const results = await provider.findByRoom('room-1');

        expect(results).toHaveLength(2);
        expect(results[0].id).toBe('1');
        expect(results[1].id).toBe('3');
    });

    it('should findByRoom apply limit option', async () => {
        const content =
            '{"id":"1","roomId":"room-1","role":"user","content":"a","createdAt":"2026-01-01T00:00:00.000Z"}\n' +
            '{"id":"2","roomId":"room-1","role":"assistant","content":"b","createdAt":"2026-01-01T00:01:00.000Z"}\n' +
            '{"id":"3","roomId":"room-1","role":"user","content":"c","createdAt":"2026-01-01T00:02:00.000Z"}\n';
        mockFs.readFile.mockResolvedValue(content);

        const provider = makeProvider();
        const results = await provider.findByRoom('room-1', { limit: 2 });

        expect(results).toHaveLength(2);
        expect(results[0].id).toBe('1');
        expect(results[1].id).toBe('2');
    });

    it('should findByRoom apply orderBy desc', async () => {
        const content =
            '{"id":"1","roomId":"room-1","role":"user","content":"a","createdAt":"2026-01-01T00:00:00.000Z"}\n' +
            '{"id":"2","roomId":"room-1","role":"assistant","content":"b","createdAt":"2026-01-01T00:01:00.000Z"}\n';
        mockFs.readFile.mockResolvedValue(content);

        const provider = makeProvider();
        const results = await provider.findByRoom('room-1', { orderBy: 'desc' });

        expect(results[0].id).toBe('2');
        expect(results[1].id).toBe('1');
    });

    it('should aggregateTokens return sum of tokenCount', async () => {
        const content =
            '{"id":"1","roomId":"room-1","role":"user","content":"a","tokenCount":10,"createdAt":"2026-01-01T00:00:00.000Z"}\n' +
            '{"id":"2","roomId":"room-1","role":"assistant","content":"b","tokenCount":20,"createdAt":"2026-01-01T00:01:00.000Z"}\n';
        mockFs.readFile.mockResolvedValue(content);

        const provider = makeProvider();
        const result = await provider.aggregateTokens('room-1');

        expect(result).toBe(30);
    });

    it('should healthCheck return true on success', async () => {
        mockFs.mkdir.mockResolvedValue('/tmp/test-data/messages');
        mockFs.access.mockResolvedValue(undefined);

        const provider = makeProvider();
        const result = await provider.healthCheck();

        expect(result).toBe(true);
    });

    it('should healthCheck return false on failure', async () => {
        mockFs.access.mockRejectedValue(new Error('Permission denied'));

        const provider = makeProvider();
        const result = await provider.healthCheck();

        expect(result).toBe(false);
    });
});
