import { beforeEach, describe, expect, it } from 'vitest';
import { DirectoryNotFoundError, FileNotFoundError } from '../errors';
import { MemoryProvider } from '../providers/memory-provider';

describe('MemoryProvider', () => {
    let provider: MemoryProvider;

    beforeEach(() => {
        provider = new MemoryProvider();
    });

    describe('canHandle', () => {
        it('应该识别 memory:// 协议', () => {
            expect(provider.canHandle('memory://docs/test.md')).toBe(true);
        });

        it('应该拒绝其他协议', () => {
            expect(provider.canHandle('idb://test.md')).toBe(false);
            expect(provider.canHandle('file://test.md')).toBe(false);
        });
    });

    describe('createDirectory', () => {
        it('应该创建目录', async () => {
            await provider.createDirectory('/docs');
            const stat = await provider.stat('/docs');
            expect(stat.type).toBe('directory');
            expect(stat.name).toBe('docs');
        });

        it('应该创建嵌套目录', async () => {
            await provider.createDirectory('/a/b/c');
            const stat = await provider.stat('/a/b/c');
            expect(stat.type).toBe('directory');
        });
    });

    describe('writeFile and readFile', () => {
        it('应该写入并读取文本文件', async () => {
            await provider.writeFile('/test.md', 'Hello, World!');
            const content = await provider.readFile('/test.md');
            expect(content).toBe('Hello, World!');
        });

        it('应该写入并读取二进制文件', async () => {
            const data = new Uint8Array([72, 101, 108, 108, 111]); // "Hello"
            await provider.writeFile('/test.bin', data);
            const content = await provider.readFile('/test.bin');
            expect(content).toEqual(data);
        });

        it('应该更新已存在的文件', async () => {
            await provider.writeFile('/test.md', 'First content');
            await provider.writeFile('/test.md', 'Second content');
            const content = await provider.readFile('/test.md');
            expect(content).toBe('Second content');
        });
    });

    describe('listFiles', () => {
        it('应该列出目录内容', async () => {
            await provider.createDirectory('/docs');
            await provider.writeFile('/docs/a.md', 'A');
            await provider.writeFile('/docs/b.md', 'B');

            const files = await provider.listFiles('/docs');
            expect(files.length).toBe(2);
            expect(files.map(f => f.name)).toEqual(['a.md', 'b.md']);
        });

        it('空目录应该返回空数组', async () => {
            await provider.createDirectory('/empty');
            const files = await provider.listFiles('/empty');
            expect(files).toEqual([]);
        });

        it('应该在目录不存在时抛出错误', async () => {
            await expect(provider.listFiles('/nonexistent')).rejects.toThrow(
                DirectoryNotFoundError,
            );
        });
    });

    describe('stat', () => {
        it('应该获取文件统计信息', async () => {
            await provider.writeFile('/test.md', 'content');
            const stat = await provider.stat('/test.md');

            expect(stat.type).toBe('file');
            expect(stat.name).toBe('test.md');
            expect(stat.size).toBe(7);
            expect(stat.ctime).toBeDefined();
            expect(stat.mtime).toBeDefined();
        });

        it('应该获取目录统计信息', async () => {
            await provider.createDirectory('/docs');
            const stat = await provider.stat('/docs');

            expect(stat.type).toBe('directory');
            expect(stat.name).toBe('docs');
        });

        it('应该在文件不存在时抛出错误', async () => {
            await expect(provider.stat('/nonexistent.md')).rejects.toThrow(FileNotFoundError);
        });
    });

    describe('deleteFile', () => {
        it('应该删除文件', async () => {
            await provider.writeFile('/test.md', 'content');
            await provider.deleteFile('/test.md');

            await expect(provider.stat('/test.md')).rejects.toThrow(FileNotFoundError);
        });

        it('应该在文件不存在时抛出错误', async () => {
            await expect(provider.deleteFile('/nonexistent.md')).rejects.toThrow(FileNotFoundError);
        });
    });

    describe('deleteDirectory', () => {
        it('应该删除目录', async () => {
            await provider.createDirectory('/docs');
            await provider.deleteDirectory('/docs');

            await expect(provider.stat('/docs')).rejects.toThrow(FileNotFoundError);
        });

        it('应该在目录不存在时抛出错误', async () => {
            await expect(provider.deleteDirectory('/nonexistent')).rejects.toThrow(
                DirectoryNotFoundError,
            );
        });
    });

    describe('getFileHandle', () => {
        it('应该抛出错误（不支持原生句柄）', async () => {
            await expect(provider.getFileHandle('/test.md', 'read')).rejects.toThrow();
        });
    });
});
