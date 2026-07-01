/**
 * FileOpenService - 文件打开服务
 *
 * 负责：
 * - 处理文件打开的完整流程
 * - 文档加载和管理
 * - 与编辑器容器的集成
 * - .md 文件自动转换为 .km 格式
 */

import 'reflect-metadata';
import {
    deserializeFromKmFile,
    serializeToKmFile,
} from '@/features/editor/converter/km-serializer';
import { parseMarkdown } from '@/features/editor/converter/markdown-parser';
import type { Document } from '@/features/editor/types';
import { ServiceBase } from '@/platform/base/service-base';
import { Inject, Service } from '@/platform/di';
import { DocumentStore } from '@/platform/document-store/service';
import type { DocumentMetadata } from '@/platform/document-store/types';
import { EditorContainer } from '@/platform/editor/container';
import { EditorTabService } from '@/platform/editor-tab/service';
import type { TabInfo } from '@/platform/editor-tab/types';
import { FileSystemService } from '@/platform/file-system/service';
import type { Logger } from '@/platform/monitor';
import { MonitorService } from '@/platform/monitor/service';

/**
 * 文件打开服务
 */
@Service({ singleton: true })
export class FileOpenService extends ServiceBase {
    private readonly _fileService: FileSystemService;
    private readonly _editorContainer: EditorContainer;
    private readonly _editorTabService: EditorTabService;
    private readonly _documentStore: DocumentStore;
    private readonly _logger: Logger;
    private _closeListenerDisposable?: { dispose(): void };

    private get fileService(): FileSystemService {
        return this._fileService;
    }

    private get editorContainer(): EditorContainer {
        return this._editorContainer;
    }

    private get editorTabService(): EditorTabService {
        return this._editorTabService;
    }

    private get documentStore(): DocumentStore {
        return this._documentStore;
    }

    protected get logger(): Logger {
        return this._logger;
    }

    constructor(
        @Inject(FileSystemService) fileService: FileSystemService,
        @Inject(EditorContainer) editorContainer: EditorContainer,
        @Inject(EditorTabService) editorTabService: EditorTabService,
        @Inject(DocumentStore) documentStore: DocumentStore,
        @Inject(MonitorService) monitorService: MonitorService,
    ) {
        super();
        this._fileService = fileService;
        this._editorContainer = editorContainer;
        this._editorTabService = editorTabService;
        this._documentStore = documentStore;
        this._logger = monitorService.getLogger('file-open');

        // 监听 tab 关闭事件，清理 DocumentStore 和 EditorContainer
        this._closeListenerDisposable = this._editorTabService.onDidCloseDocument(id => {
            this._documentStore.remove(id);
            this._editorContainer.disposeInstance(id);
        });
    }

    /**
     * 打开文件
     *
     * - .km 文件：直接打开编辑
     * - .md/.mdx/.markdown 文件：自动转换为 .km 格式后打开
     * - 其他类型：不支持
     */
    async openFile(path: string): Promise<void> {
        try {
            const ext = path.split('.').pop()?.toLowerCase();

            // .md 文件：自动转换为 .km
            if (ext === 'md' || ext === 'mdx' || ext === 'markdown') {
                const kmPath = await this.convertMdToKm(path);
                await this.openFile(kmPath);
                return;
            }

            // 只支持 .km 文件编辑
            if (ext !== 'km') {
                this.logger.warn(`不支持的文件类型: ${ext}，仅支持 .km 文件`);
                return;
            }

            const id = `file:${path}`;

            // 如果已打开，仅激活
            if (this.editorTabService.getActiveDocumentId() === id) {
                return;
            }
            if (this.editorTabService.getOpenDocuments().some(d => d.id === id)) {
                this.editorTabService.activateDocument(id);
                return;
            }

            // 读取文件内容
            const content = await this.fileService.readFile(path);
            const contentString = this.decodeContent(content);

            // 解析文档
            const { blocks, metadata } = deserializeFromKmFile(contentString);
            const fileName = path.split('/').pop() || '未命名文档';
            const title = metadata.title || fileName;

            // 1. 写 tab 信息（纯 tab 身份）
            const tabInfo: TabInfo = {
                id,
                title,
                openedAt: new Date().toISOString(),
            };
            this.editorTabService.openDocument(tabInfo);

            // 2. 写文档元数据（path, type, title）
            const docMeta: DocumentMetadata = {
                id,
                path,
                type: 'km',
                title,
            };
            this.documentStore.put(id, docMeta);

            // 3. 创建 EditorService 并加载内容
            const editorService = this.editorContainer.createInstance(id, path);
            const document: Document = {
                id,
                path,
                title,
                type: 'km',
                content: blocks,
                version: 1,
                createdAt: metadata.createdAt,
                updatedAt: metadata.updatedAt,
            };
            editorService.loadDocument(document);

            this.logger.info(`Opened file: ${path}`);
        } catch (error) {
            this.logger.error(`Failed to open file ${path}:`, error);
            throw error;
        }
    }

    /**
     * 打开多个文件
     */
    async openFiles(paths: string[]): Promise<void> {
        for (const path of paths) {
            try {
                await this.openFile(path);
            } catch (error) {
                this.logger.error(`Failed to open file ${path}:`, error);
            }
        }
    }

    /**
     * 关闭文件
     */
    closeFile(path: string): void {
        const docMeta = this.documentStore.getByPath(path);
        if (docMeta) {
            // 关闭 tab，事件监听器会自动清理 DocumentStore 和 EditorContainer
            this.editorTabService.closeDocument(docMeta.id);
            this.logger.info(`Closed file: ${path}`);
        }
    }

    /**
     * 关闭所有文件
     */
    closeAll(): void {
        this.editorTabService.closeAllDocuments();
        // 事件监听器会逐个触发清理，但批量操作更高效
        this.editorContainer.disposeAll();
        for (const d of this.documentStore.getAll()) {
            this.documentStore.remove(d.id);
        }
        this.logger.info('Closed all files');
    }

    /**
     * 保存文件
     */
    async saveFile(path: string, content: string): Promise<void> {
        await this.fileService.writeFile(path, new TextEncoder().encode(content));
        this.logger.info(`Saved file: ${path}`);
    }

    /**
     * 将 .md 文件转换为 .km 格式
     *
     * 读取 .md → 解析为 Block[] → 序列化为 .km → 写入同名 .km 文件 → 返回 .km 路径
     */
    private async convertMdToKm(mdPath: string): Promise<string> {
        const content = await this.fileService.readFile(mdPath);
        const contentString = this.decodeContent(content);

        const blocks = parseMarkdown(contentString);

        const kmContent = serializeToKmFile(blocks, {
            title: mdPath.split('/').pop() || '未命名文档',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        });

        const kmPath = mdPath.replace(/\.(md|mdx|markdown)$/, '.km');
        await this.fileService.writeFile(kmPath, new TextEncoder().encode(kmContent));

        this.logger.info(`Converted ${mdPath} → ${kmPath}`);
        return kmPath;
    }

    /**
     * 解码文件内容为字符串
     */
    private decodeContent(content: unknown): string {
        if (content instanceof Uint8Array) {
            return new TextDecoder().decode(content);
        }
        if (typeof content === 'string') {
            return content;
        }
        return '';
    }

    override dispose(): void {
        this._closeListenerDisposable?.dispose();
        this.closeAll();
        super.dispose();
    }
}
