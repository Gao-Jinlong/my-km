import { detectEnvironment } from '../env/environment';
import type { IFileSystemAdapter } from './types';
import { WebAdapter } from './web/web-adapter';

/**
 * 创建适合当前环境的适配器
 * 自动检测运行环境并返回对应的适配器实例
 *
 * 当前仅支持 Web 环境（浏览器 File System Access API）
 */
export async function createAdapter(): Promise<IFileSystemAdapter> {
    const env = detectEnvironment();

    if (env === 'web') {
        const adapter = new WebAdapter();
        if (await adapter.isSupported()) {
            return adapter;
        }
        throw new Error(
            'Web File System API is not supported in this browser. ' +
                'Please use a Chromium-based browser (Chrome, Edge).',
        );
    }

    throw new Error(
        `Environment "${env}" is not supported. ` +
            'Currently only browser environment (web) with File System Access API is supported.',
    );
}

/**
 * 手动创建 Web 适配器
 * 用于测试或强制使用 Web 环境
 */
export function createWebAdapter(): IFileSystemAdapter {
    return new WebAdapter();
}

/**
 * 创建 Mock 适配器用于测试
 */
export function createMockAdapter(initialFiles?: Map<string, string>): IFileSystemAdapter {
    const files = initialFiles ?? new Map<string, string>();

    class MockAdapter implements IFileSystemAdapter {
        readonly name = 'mock';

        async isSupported(): Promise<boolean> {
            return true;
        }

        async openDirectoryPicker(): Promise<string | null> {
            return 'mock-project';
        }

        async readFile(path: string) {
            const content = files.get(path) ?? '';
            return {
                content,
                fileInfo: {
                    name: path.split('/').pop() || path,
                    path,
                    kind: 'file' as const,
                    size: content.length,
                },
            };
        }

        async writeFile(path: string, content: string | Uint8Array): Promise<void> {
            files.set(path, typeof content === 'string' ? content : '');
        }

        async listDirectory(path: string) {
            const entries: { name: string; kind: 'file' | 'directory'; path: string }[] = [];
            const prefix = path ? `${path}/` : '';

            const seenDirs = new Set<string>();

            for (const [filePath] of files.entries()) {
                if (filePath.startsWith(prefix)) {
                    const relative = filePath.slice(prefix.length);
                    const parts = relative.split('/');

                    if (parts.length === 1) {
                        entries.push({
                            name: parts[0],
                            kind: 'file',
                            path: filePath,
                        });
                    } else if (!seenDirs.has(parts[0])) {
                        seenDirs.add(parts[0]);
                        entries.push({
                            name: parts[0],
                            kind: 'directory',
                            path: prefix ? `${prefix}${parts[0]}` : parts[0],
                        });
                    }
                }
            }

            return entries;
        }

        async getFileInfo(path: string) {
            const content = files.get(path);
            if (content !== undefined) {
                return {
                    name: path.split('/').pop() || path,
                    path,
                    kind: 'file' as const,
                    size: content.length,
                };
            }
            throw new Error(`File not found: ${path}`);
        }

        async remove(path: string): Promise<void> {
            files.delete(path);
        }

        async exists(path: string): Promise<boolean> {
            return files.has(path);
        }

        async createDirectory(): Promise<void> {
            // Mock 不需要实际创建目录
        }
    }

    return new MockAdapter();
}
