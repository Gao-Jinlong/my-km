/**
 * FileOpenService - 文件打开服务
 *
 * 负责：
 * - 处理文件打开的完整流程
 * - 文档加载和管理
 * - 与编辑器容器的集成
 */

import 'reflect-metadata';
import { ServiceBase } from '@/platform/base/service-base';
import { container } from '@/platform/bootstrap';
import { Service } from '@/platform/di';
import { EditorContainer } from '@/platform/editor/container';
import { FileSystemService } from '@/platform/file-system/service';
import { type OpenDocument, useEditorUIStore } from '@/stores/editor-ui-store';

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

    constructor() {
        super();
        this.fileService = container.get(FileSystemService);
        this.editorContainer = container.get(EditorContainer);
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

            // 更新 UI Store（打开文档）
            useEditorUIStore.getState().openDocument(document);

            // TODO: 创建/获取编辑器实例并加载文档
            // const editor = this.editorContainer.createInstance(document.id);
            // editor.loadDocument(document);

            console.log(`[FileOpenService] Opened file: ${path} (${docType})`);
        } catch (error) {
            console.error(`[FileOpenService] Failed to open file ${path}:`, error);
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
                console.error(`[FileOpenService] Failed to open file ${path}:`, error);
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
        // 从 UI Store 中查找文档
        const { openDocuments, closeDocument } = useEditorUIStore.getState();
        const openDoc = openDocuments.find(doc => doc.path === path);

        if (openDoc) {
            // 销毁编辑器实例
            this.editorContainer.disposeInstance(openDoc.id);

            // 关闭文档
            closeDocument(openDoc.id);

            console.log(`[FileOpenService] Closed file: ${path}`);
        }
    }

    /**
     * 关闭所有文件
     */
    closeAll(): void {
        // 销毁所有编辑器实例
        this.editorContainer.disposeAll();

        // 清空 UI Store
        useEditorUIStore.getState().closeAllDocuments();

        console.log('[FileOpenService] Closed all files');
    }

    /**
     * 保存文件
     *
     * @param path 文件路径
     * @param content 文件内容
     */
    async saveFile(path: string, content: string): Promise<void> {
        await this.fileService.writeFile(path, new TextEncoder().encode(content));
        console.log(`[FileOpenService] Saved file: ${path}`);
    }

    /**
     * 推断文档类型
     */
    private inferDocumentType(path: string): 'rich-text' | 'markdown' {
        const ext = path.split('.').pop()?.toLowerCase();

        switch (ext) {
            case 'md':
            case 'mdx':
            case 'markdown':
                return 'markdown';
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
        type: 'rich-text' | 'markdown',
    ): OpenDocument {
        // 使用文件路径作为文档 ID（确保唯一性）
        const id = `file:${path}`;

        // 从路径提取标题
        const title =
            path
                .split('/')
                .pop()
                ?.replace(/\.[^.]+$/, '') || '未命名文档';

        // 将内容转换为字符串存储
        let contentString: string;
        if (content instanceof Uint8Array) {
            contentString = new TextDecoder().decode(content);
        } else if (typeof content === 'string') {
            contentString = content;
        } else {
            contentString = '';
        }

        return {
            id,
            path,
            title,
            type,
            isDirty: false,
            openedAt: new Date().toISOString(),
            content: contentString,
        };
    }

    override dispose(): void {
        this.closeAll();
        super.dispose();
    }
}
