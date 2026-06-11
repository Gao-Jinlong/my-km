import type { FileSystemService } from '@/platform/file-system/service';
import type { FrontendToolHandler, ToolResult } from '../types';

interface TreeItem {
    name: string;
    type: 'file' | 'directory';
    path: string;
    children?: TreeItem[];
}

export class GetChildItemsHandler implements FrontendToolHandler {
    readonly name = 'get_child_items';
    readonly type = 'read';

    constructor(
        private readonly fileSystemService: FileSystemService,
        private readonly getProjectRoot: () => string | null,
    ) {}

    describe(args: Record<string, unknown>): string {
        const root = String(args.root ?? '<project root>');
        const depth = typeof args.depth === 'number' ? args.depth : 1;
        return `列出 ${root} 下 ${depth} 层的子项`;
    }

    async execute(args: Record<string, unknown>): Promise<ToolResult> {
        let root: string | null = typeof args.root === 'string' ? args.root : null;
        if (!root) {
            root = this.getProjectRoot();
            if (!root) {
                return {
                    success: false,
                    error: 'No project root available; please provide root explicitly',
                };
            }
        }
        const depth = typeof args.depth === 'number' && args.depth > 0 ? args.depth : 1;

        try {
            const items = await this.walk(root, depth);
            return { success: true, root, items };
        } catch (err) {
            return {
                success: false,
                error: `Failed to list child items: ${(err as Error).message}`,
            };
        }
    }

    private async walk(dir: string, remainingDepth: number): Promise<TreeItem[]> {
        const stats = await this.fileSystemService.listFiles(dir);
        const items: TreeItem[] = [];
        for (const stat of stats) {
            const item: TreeItem = {
                name: stat.name,
                type: stat.type,
                path: stat.path,
            };
            if (stat.type === 'directory' && remainingDepth > 1) {
                item.children = await this.walk(stat.path, remainingDepth - 1);
            }
            items.push(item);
        }
        return items;
    }
}
