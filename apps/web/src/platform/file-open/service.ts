/**
 * FileOpenService - 文件打开服务
 *
 * 负责：
 * - 处理文件打开的完整流程
 * - 文档加载和管理
 * - 与编辑器容器的集成
 */

import 'reflect-metadata';
import { deserializeFromKmFile } from '@/features/editor/converter/km-serializer';
import { parseMarkdown } from '@/features/editor/converter/markdown-parser';
import type { Document } from '@/features/editor/types';
import { ServiceBase } from '@/platform/base/service-base';
import { container } from '@/platform/bootstrap';
import { Service } from '@/platform/di';
import { EditorContainer } from '@/platform/editor/container';
import { EditorTabService } from '@/platform/editor-tab/service';
import type { OpenDocument } from '@/platform/editor-tab/types';
import { FileSystemService } from '@/platform/file-system/service';
import { LoggerService } from '@/platform/logger/service';

/**
 * 文件打开服务
 *
 * @example
 * ```typescript
 * const fileOpenService = container.get(FileOpenService);
 *
 * // 打开文件
 * await fileOpenService.openFile('/path/to/file.md');
 *
 * // 关闭文件
 * fileOpenService.closeFile('/path/to/file.md');
 * ```
 */
@Service({ singleton: true })
export class FileOpenService extends ServiceBase {
    private fileService: FileSystemService;
    private editorContainer: EditorContainer;
    private editorTabService: EditorTabService;
    private readonly logger = container.get(LoggerService).getLogger('file-open');

    constructor() {
        super();
        this.fileService = container.get(FileSystemService);
        this.editorContainer = container.get(EditorContainer);
        this.editorTabService = container.get(EditorTabService);
    }

    /**
     * 打开文件
     *
     * @param path 文件路径
     * @param type 文档类型（可选，默认从扩展名推断）
     *
     * @example
     * ```typescript
     * await fileOpenService.openFile('/docs/guide.md');
     * await fileOpenService.openFile('/docs/notes.mdx', 'markdown');
     * ```
     */
    async openFile(path: string, type?: 'rich-text' | 'markdown'): Promise<void> {
        try {
            // 读取文件内容
            const content = await this.fileService.readFile(path);

            // 推断文档类型
            const docType = type || this.inferDocumentType(path);

            // 创建文档对象
            const document = this.createDocument(path, content, docType);

            // 打开文档标签
            this.editorTabService.openDocument(document);

            // TODO: 创建/获取编辑器实例并加载文档
            // const editor = this.editorContainer.createInstance(document.id);
            // editor.loadDocument(document);

            this.logger.info(`Opened file: ${path} (${docType})`);
        } catch (error) {
            this.logger.error(`Failed to open file ${path}:`, error);
            throw error;
        }
    }

    /**
     * 打开多个文件
     *
     * @param paths 文件路径数组
     */
    async openFiles(paths: string[]): Promise<void> {
        for (const path of paths) {
            try {
                await this.openFile(path);
            } catch (error) {
                this.logger.error(`Failed to open file ${path}:`, error);
                // 继续打开其他文件
            }
        }
    }

    /**
     * 关闭文件
     *
     * @param path 文件路径
     */
    closeFile(path: string): void {
        // 从标签服务中查找文档
        const openDocuments = this.editorTabService.getOpenDocuments();
        const openDoc = openDocuments.find(doc => doc.path === path);

        if (openDoc) {
            // 销毁编辑器实例
            this.editorContainer.disposeInstance(openDoc.id);

            // 关闭文档
            this.editorTabService.closeDocument(openDoc.id);

            this.logger.info(`Closed file: ${path}`);
        }
    }

    /**
     * 关闭所有文件
     */
    closeAll(): void {
        // 销毁所有编辑器实例
        this.editorContainer.disposeAll();

        // 关闭所有文档标签
        this.editorTabService.closeAllDocuments();

        this.logger.info('Closed all files');
    }

    /**
     * 保存文件
     *
     * @param path 文件路径
     * @param content 文件内容
     */
    async saveFile(path: string, content: string): Promise<void> {
        await this.fileService.writeFile(path, new TextEncoder().encode(content));
        this.logger.info(`Saved file: ${path}`);
    }

    /**
     * 推断文档类型
     */
    private inferDocumentType(path: string): 'rich-text' | 'markdown' | 'km' {
        const ext = path.split('.').pop()?.toLowerCase();

        switch (ext) {
            case 'md':
            case 'mdx':
            case 'markdown':
                return 'markdown';
            case 'km':
                return 'km';
            default:
                return 'rich-text';
        }
    }

    /**
     * 创建文档对象
     *
     * 使用文件路径作为文档 ID，确保同一文件不会打开多个标签页
     */
    private createDocument(
        path: string,
        content: unknown,
        type: 'rich-text' | 'markdown' | 'km',
    ): OpenDocument {
        // 使用文件路径作为文档 ID（确保唯一性）
        const id = `file:${path}`;

        // 从路径提取标题（保留扩展名）
        const fileName = path.split('/').pop() || '未命名文档';
        const title = fileName;

        // 将内容转换为字符串存储
        let contentString: string;
        if (content instanceof Uint8Array) {
            contentString = new TextDecoder().decode(content);
        } else if (typeof content === 'string') {
            contentString = content;
        } else {
            contentString = '';
        }

        // 对于 Markdown 文件，解析为 Block[] 并序列化存储
        let storedContent: string = '';
        let document: Document | undefined;

        if (type === 'markdown') {
            const blocks = parseMarkdown(contentString);
            document = {
                id,
                path,
                title,
                type,
                content: blocks,
                version: 1,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
            };
            storedContent = JSON.stringify(blocks);
        } else if (type === 'km') {
            // 对于.km 文件，使用专有格式解析
            const { blocks, metadata } = deserializeFromKmFile(contentString);
            document = {
                id,
                path,
                title: metadata.title || title,
                type: 'km',
                content: blocks,
                version: 1,
                createdAt: metadata.createdAt,
                updatedAt: metadata.updatedAt,
            };
            storedContent = contentString; // .km 文件直接存储原始 JSON
        }

        // 同时返回 Document 对象用于编辑器
        return {
            id,
            path,
            title: document?.title || title,
            type,
            isDirty: false,
            openedAt: new Date().toISOString(),
            content: storedContent,
            document,
        } as OpenDocument;
    }

    override dispose(): void {
        this.closeAll();
        super.dispose();
    }
}
