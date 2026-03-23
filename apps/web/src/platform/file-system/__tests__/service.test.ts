import { beforeEach, describe, expect, it } from 'vitest';
import { FileNotFoundError, ProviderNotFoundError } from '../errors';
import { MemoryProvider } from '../providers/memory-provider';
import { FileSystemService } from '../service';

describe('FileSystemService', () => {
    let service: FileSystemService;

    beforeEach(() => {
        service = new FileSystemService();
        service.registerProvider(new MemoryProvider());
    });

    describe('registerProvider', () => {
        it('应该注册 Provider', () => {
            const providers = service.getRegisteredProviders();
            expect(providers.some(p => p.scheme === 'memory')).toBe(true);
        });

        it('应该能够通过 scheme 获取 Provider', () => {
            const provider = service['getProvider']('memory');
            expect(provider).toBeInstanceOf(MemoryProvider);
        });

        it('应该在 Provider 不存在时抛出错误', () => {
            expect(() => service['getProvider']('nonexistent')).toThrow(ProviderNotFoundError);
        });
    });

    describe('resolvePath and routing', () => {
        it('应该路由到正确的 Provider', async () => {
            await service.writeFile('memory://test.md', 'content');
            const content = await service.readFile('memory://test.md');
            expect(content).toBe('content');
        });

        it('应该在 scheme 未注册时抛出错误', async () => {
            await expect(service.readFile('idb://test.md')).rejects.toThrow(ProviderNotFoundError);
        });
    });

    describe('capability check', () => {
        it('应该允许有能力的操作', async () => {
            // MemoryProvider 有 FullAccess 能力
            await service.writeFile('memory://test.md', 'content');
            const content = await service.readFile('memory://test.md');
            expect(content).toBe('content');
        });
    });

    describe('readFile', () => {
        it('应该读取文件内容', async () => {
            await service.writeFile('memory://test.md', 'Hello!');
            const content = await service.readFile('memory://test.md');
            expect(content).toBe('Hello!');
        });

        it('应该在文件不存在时抛出错误', async () => {
            await expect(service.readFile('memory://nonexistent.md')).rejects.toThrow(
                FileNotFoundError,
            );
        });
    });

    describe('writeFile', () => {
        it('应该写入文件内容', async () => {
            await service.writeFile('memory://test.md', 'New content');
            const content = await service.readFile('memory://test.md');
            expect(content).toBe('New content');
        });
    });

    describe('listFiles', () => {
        it('应该列出目录内容', async () => {
            await service.createDirectory('memory://docs');
            await service.writeFile('memory://docs/a.md', 'A');
            await service.writeFile('memory://docs/b.md', 'B');

            const files = await service.listFiles('memory://docs');
            expect(files.length).toBe(2);
        });
    });

    describe('createDirectory', () => {
        it('应该创建目录', async () => {
            await service.createDirectory('memory://new-dir');
            const stat = await service.stat('memory://new-dir');
            expect(stat.type).toBe('directory');
        });
    });

    describe('deleteFile', () => {
        it('应该删除文件', async () => {
            await service.writeFile('memory://test.md', 'content');
            await service.deleteFile('memory://test.md');

            await expect(service.stat('memory://test.md')).rejects.toThrow(FileNotFoundError);
        });
    });

    describe('deleteDirectory', () => {
        it('应该删除目录', async () => {
            await service.createDirectory('memory://docs');
            await service.deleteDirectory('memory://docs');

            await expect(service.stat('memory://docs')).rejects.toThrow(FileNotFoundError);
        });
    });

    describe('stat', () => {
        it('应该获取文件统计信息', async () => {
            await service.writeFile('memory://test.md', 'content');
            const stat = await service.stat('memory://test.md');

            expect(stat.type).toBe('file');
            expect(stat.name).toBe('test.md');
        });
    });

    describe('isValidPath', () => {
        it('应该识别有效路径', () => {
            expect(service.isValidPath('memory://test.md')).toBe(true);
        });

        it('应该识别无效路径', () => {
            expect(service.isValidPath('invalid-scheme://test.md')).toBe(false);
        });
    });

    describe('dispose', () => {
        it('应该清理所有资源', () => {
            service.dispose();
            expect(service.getRegisteredProviders().length).toBe(0);
        });
    });
});
