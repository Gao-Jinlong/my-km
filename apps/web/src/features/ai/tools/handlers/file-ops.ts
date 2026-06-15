import type { FileSystemService } from '@/platform/file-system/service';
import type { FrontendToolHandler, ToolResult } from '../types';

interface TreeItem {
    name: string;
    type: 'file' | 'directory';
    path: string;
    children?: TreeItem[];
}

export class FileOpsHandler implements FrontendToolHandler {
    readonly name = 'file_ops';
    readonly type = 'write';

    constructor(
        private readonly fileSystemService: FileSystemService,
        private readonly getProjectRoot: () => string | null,
    ) {}

    describe(args: Record<string, unknown>): string {
        const operation = String(args.operation ?? '');
        const path = String(args.path ?? '<project root>');
        const opLabels: Record<string, string> = {
            list: '列出',
            create: '创建',
            delete: '删除',
            move: '移动',
            rename: '重命名',
            copy: '复制',
        };
        return `${opLabels[operation] ?? operation} ${path}`;
    }

    async execute(args: Record<string, unknown>): Promise<ToolResult> {
        const operation = args.operation as string;
        const rawPath = (args.path as string) || this.getProjectRoot();

        if (!rawPath) {
            return { success: false, error: 'No path provided and no project root available' };
        }

        const resolvedPath = this.resolveProjectPath(rawPath);
        if (typeof resolvedPath !== 'string') return resolvedPath;

        switch (operation) {
            case 'list':
                return this.handleList(resolvedPath, args);
            case 'create':
                return this.handleCreate(resolvedPath, args);
            case 'delete':
                return this.handleDelete(resolvedPath);
            case 'move':
                return this.handleMove(resolvedPath, args);
            case 'rename':
                return this.handleRename(resolvedPath, args);
            case 'copy':
                return this.handleCopy(resolvedPath, args);
            default:
                return { success: false, error: `Unknown operation: ${operation}` };
        }
    }

    private resolveProjectPath(path: string): string | ToolResult {
        if (path.startsWith('memory://')) {
            return {
                success: false,
                error: 'memory:// paths are not available for the current project. Use file:// or a project-relative path instead.',
            };
        }

        if (path.includes('://')) return path;

        const root = this.getProjectRoot();
        if (!root) {
            return { success: false, error: 'No project root available for relative path' };
        }

        const trimmedPath = path.replace(/^\/+/, '');
        if (root.endsWith('://')) return `${root}${trimmedPath}`;

        const trimmedRoot = root.replace(/\/+$/, '');
        return `${trimmedRoot}/${trimmedPath}`;
    }

    private async handleList(path: string, args: Record<string, unknown>): Promise<ToolResult> {
        const recursive = args.recursive === true;
        const depth = typeof args.depth === 'number' && args.depth > 0 ? args.depth : 1;

        try {
            const items = recursive
                ? await this.walk(path, depth)
                : await this.listSingleLevel(path);
            return { success: true, path, items };
        } catch (err) {
            return {
                success: false,
                error: `Failed to list: ${(err as Error).message}`,
            };
        }
    }

    private async listSingleLevel(path: string): Promise<TreeItem[]> {
        const stats = await this.fileSystemService.listFiles(path);
        return stats.map(s => ({
            name: s.name,
            type: s.type as 'file' | 'directory',
            path: s.path,
        }));
    }

    private async walk(dir: string, remainingDepth: number): Promise<TreeItem[]> {
        const stats = await this.fileSystemService.listFiles(dir);
        const items: TreeItem[] = [];
        for (const stat of stats) {
            const item: TreeItem = {
                name: stat.name,
                type: stat.type as 'file' | 'directory',
                path: stat.path,
            };
            if (stat.type === 'directory' && remainingDepth > 1) {
                item.children = await this.walk(stat.path, remainingDepth - 1);
            }
            items.push(item);
        }
        return items;
    }

    private async handleCreate(path: string, args: Record<string, unknown>): Promise<ToolResult> {
        const type = args.type as string;
        try {
            if (type === 'folder') {
                await this.fileSystemService.createDirectory(path);
            } else {
                const emptyKm = JSON.stringify({
                    version: 1,
                    metadata: {
                        title: '',
                        createdAt: new Date().toISOString(),
                        updatedAt: new Date().toISOString(),
                    },
                    blocks: [],
                });
                await this.fileSystemService.writeFile(path, emptyKm);
            }
            return { success: true, path };
        } catch (err) {
            return { success: false, error: `Failed to create: ${(err as Error).message}` };
        }
    }

    private async handleDelete(path: string): Promise<ToolResult> {
        try {
            const stat = await this.fileSystemService.stat(path);
            if (stat.type === 'directory') {
                await this.fileSystemService.deleteDirectory(path);
            } else {
                await this.fileSystemService.deleteFile(path);
            }
            return { success: true };
        } catch (err) {
            return { success: false, error: `Failed to delete: ${(err as Error).message}` };
        }
    }

    private async handleMove(path: string, args: Record<string, unknown>): Promise<ToolResult> {
        const destination = args.destination as string;
        if (!destination) {
            return { success: false, error: 'destination is required for move operation' };
        }
        const resolvedDestination = this.resolveProjectPath(destination);
        if (typeof resolvedDestination !== 'string') return resolvedDestination;

        try {
            const content = await this.fileSystemService.readFile(path);
            const contentStr =
                typeof content === 'string' ? content : new TextDecoder().decode(content);
            await this.fileSystemService.writeFile(resolvedDestination, contentStr);
            await this.fileSystemService.deleteFile(path);
            return { success: true, newPath: resolvedDestination };
        } catch (err) {
            return { success: false, error: `Failed to move: ${(err as Error).message}` };
        }
    }

    private async handleRename(path: string, args: Record<string, unknown>): Promise<ToolResult> {
        const destination = args.destination as string;
        if (!destination) {
            return { success: false, error: 'destination is required for rename operation' };
        }
        try {
            const stat = await this.fileSystemService.stat(path);
            const newName = destination;
            if (stat.type === 'directory') {
                await this.fileSystemService.renameDirectory(path, newName);
            } else {
                await this.fileSystemService.renameFile(path, newName);
            }
            return { success: true, newPath: destination };
        } catch (err) {
            return { success: false, error: `Failed to rename: ${(err as Error).message}` };
        }
    }

    private async handleCopy(path: string, args: Record<string, unknown>): Promise<ToolResult> {
        const destination = args.destination as string;
        if (!destination) {
            return { success: false, error: 'destination is required for copy operation' };
        }
        const resolvedDestination = this.resolveProjectPath(destination);
        if (typeof resolvedDestination !== 'string') return resolvedDestination;

        try {
            const content = await this.fileSystemService.readFile(path);
            const contentStr =
                typeof content === 'string' ? content : new TextDecoder().decode(content);
            await this.fileSystemService.writeFile(resolvedDestination, contentStr);
            return { success: true, newPath: resolvedDestination };
        } catch (err) {
            return { success: false, error: `Failed to copy: ${(err as Error).message}` };
        }
    }
}
