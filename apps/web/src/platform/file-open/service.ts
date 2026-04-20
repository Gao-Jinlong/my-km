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
import { container } from '@/platform/bootstrap';
import { Service } from '@/platform/di';
import { EditorContainer } from '@/platform/editor/container';
import { EditorTabService } from '@/platform/editor-tab/service';
import type { OpenDocument } from '@/platform/editor-tab/types';
import { FileSystemService } from '@/platform/file-system/service';
import type { Logger } from '@/platform/monitor';
import { MonitorService } from '@/platform/monitor/service';

/**
 * 文件打开服务
 */
@Service({ singleton: true })
export class FileOpenService extends ServiceBase {
    private _fileService?: FileSystemService;
    private _editorContainer?: EditorContainer;
    private _editorTabService?: EditorTabService;
    private _logger?: Logger;

    private get fileService(): FileSystemService {
        if (!this._fileService) {
            this._fileService = container.get(FileSystemService);
        }
        return this._fileService;
    }

    private get editorContainer(): EditorContainer {
        if (!this._editorContainer) {
            this._editorContainer = container.get(EditorContainer);
        }
        return this._editorContainer;
    }

    private get editorTabService(): EditorTabService {
        if (!this._editorTabService) {
            this._editorTabService = container.get(EditorTabService);
        }
        return this._editorTabService;
    }

    protected get logger(): Logger {
        if (!this._logger) {
            this._logger = container.get(MonitorService).getLogger('file-open');
        }
        return this._logger;
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

            // 读取文件内容
            const content = await this.fileService.readFile(path);
            const contentString = this.decodeContent(content);

            // 创建文档对象
            const document = this.createDocument(path, contentString);

            // 打开文档标签
            this.editorTabService.openDocument(document);

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
        const openDocuments = this.editorTabService.getOpenDocuments();
        const openDoc = openDocuments.find(doc => doc.path === path);

        if (openDoc) {
            this.editorContainer.disposeInstance(openDoc.id);
            this.editorTabService.closeDocument(openDoc.id);
            this.logger.info(`Closed file: ${path}`);
        }
    }

    /**
     * 关闭所有文件
     */
    closeAll(): void {
        this.editorContainer.disposeAll();
        this.editorTabService.closeAllDocuments();
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
     * 创建文档对象（仅处理 .km 格式）
     */
    private createDocument(path: string, content: string): OpenDocument {
        const id = `file:${path}`;
        const fileName = path.split('/').pop() || '未命名文档';

        const { blocks, metadata } = deserializeFromKmFile(content);

        const document: Document = {
            id,
            path,
            title: metadata.title || fileName,
            type: 'km',
            content: blocks,
            version: 1,
            createdAt: metadata.createdAt,
            updatedAt: metadata.updatedAt,
        };

        return {
            id,
            path,
            title: document.title,
            type: 'km',
            isDirty: false,
            openedAt: new Date().toISOString(),
            content: JSON.stringify(blocks),
            document,
        };
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
        this.closeAll();
        super.dispose();
    }
}
