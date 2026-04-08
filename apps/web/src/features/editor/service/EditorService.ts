/**
 * EditorService - 单个编辑器的业务逻辑服务
 *
 * 负责管理单个 Lexical Editor 实例，提供文档操作、选区管理、命令执行等功能
 */

import type { LexicalEditor } from 'lexical';
import { $getRoot } from 'lexical';
import type { BlockRegistry } from '../registry/BlockRegistry';
import type { EditorStoreApi } from '../store/editor-store';
import { createEditorStore } from '../store/editor-store';
import type { Block, Document, FormatState, Selection } from '../types';
import { blocksToLexical, lexicalToBlocks } from '../converter/block-lexical-converter';
import { parseMarkdown } from '../converter/markdown-parser';
import { serializeToMarkdown } from '../converter/markdown-serializer';
import { FileSystemService } from '@/platform/file-system/service';
import { container } from '@/platform/bootstrap';

/**
 * 文档保存结果
 */
export interface SaveResult {
    success: boolean;
    document?: Document;
    error?: string;
}

/**
 * EditorService 接口定义
 */
export interface EditorService {
    // 属性
    documentId: string;
    filePath: string;
    store: EditorStoreApi;
    readonly isDisposed: boolean;

    // 编辑器实例（从 React 组件注入）
    setEditor(editor: LexicalEditor): void;
    getEditor(): LexicalEditor | null;

    // 文档操作
    loadDocument(doc: Document): void;
    saveDocument(): Promise<SaveResult>;

    // 选区与内容
    getSelection(): Selection | null;
    getSelectedText(): string | null;
    getFullContent(): string;
    getFormatState(): FormatState;

    // 生命周期
    destroy(): void;
}

/**
 * EditorService 实现类
 */
class EditorServiceImpl implements EditorService {
    documentId: string;
    filePath: string;
    store: EditorStoreApi;
    private editor: LexicalEditor | null = null;
    private disposed: boolean = false;

    get isDisposed(): boolean {
        return this.disposed;
    }

    constructor(documentId: string, filePath: string, store: EditorStoreApi) {
        this.documentId = documentId;
        this.filePath = filePath;
        this.store = store;

        // 初始化编辑器事件监听
        this.setupEditorListeners();
    }

    /**
     * 设置 Lexical 编辑器实例（从 React 组件注入）
     */
    setEditor(editor: LexicalEditor): void {
        this.editor = editor;
    }

    /**
     * 获取 Lexical 编辑器实例
     */
    getEditor(): LexicalEditor | null {
        return this.editor;
    }

    /**
     * 设置编辑器事件监听
     */
    private setupEditorListeners(): void {
        // 监听选区变化 - 通过 UpdateListener 在 React 组件中注册
    }

    /**
     * 加载文档
     * @param doc 要加载的文档
     */
    loadDocument(doc: Document): void {
        if (this.disposed) {
            throw new Error('EditorService has been destroyed');
        }

        try {
            this.store.setDocument(doc);
            this.store.markClean();
            this.store.clearError();

            // 将文档内容加载到 Lexical 编辑器
            if (this.editor) {
                blocksToLexical(doc.content, this.editor);
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Failed to load document';
            this.store.setError(errorMessage);
            throw error;
        }
    }

    /**
     * 保存文档
     * @returns 保存结果
     */
    async saveDocument(): Promise<SaveResult> {
        if (this.disposed) {
            return {
                success: false,
                error: 'EditorService has been destroyed',
            };
        }

        try {
            if (!this.editor) {
                return {
                    success: false,
                    error: 'Editor not initialized',
                };
            }

            // 从 Lexical 编辑器获取当前内容
            const blocks = lexicalToBlocks(this.editor);

            // 序列化为 Markdown
            const markdown = serializeToMarkdown(blocks);

            // 写入文件
            const fileSystem = container.get(FileSystemService);
            await fileSystem.writeFile(this.filePath, markdown);

            // 更新文档内容
            const currentDoc = this.store.document;
            if (!currentDoc) {
                return {
                    success: false,
                    error: 'No document loaded',
                };
            }

            const updatedDoc: Document = {
                ...currentDoc,
                content: blocks,
                version: currentDoc.version + 1,
                updatedAt: new Date().toISOString(),
            };

            this.store.setDocument(updatedDoc);
            this.store.markClean();

            return {
                success: true,
                document: updatedDoc,
            };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Failed to save document';
            this.store.setError(errorMessage);
            return {
                success: false,
                error: errorMessage,
            };
        }
    }

    /**
     * 获取当前选区
     * @returns 当前选区，如果没有选区则返回 null
     */
    getSelection(): Selection | null {
        if (!this.editor) {
            return null;
        }

        let lexicalSelection: any = null;
        this.editor.getEditorState().read(() => {
            // TODO: 使用 @lexical/selection 获取选区
            lexicalSelection = null;
        });

        if (!lexicalSelection) {
            return null;
        }

        // TODO: 将 Lexical 选区转换为 Selection 格式
        return null;
    }

    /**
     * 获取选中的文本
     * @returns 选中的文本，如果没有选区则返回 null
     */
    getSelectedText(): string | null {
        const selection = this.getSelection();
        return selection?.text ?? null;
    }

    /**
     * 获取完整内容
     * @returns 编辑器中的完整文本内容
     */
    getFullContent(): string {
        if (!this.editor) {
            return '';
        }

        return this.editor.getEditorState().read(() => {
            return $getRoot().getTextContent();
        });
    }

    /**
     * 获取当前格式状态
     * @returns 当前格式状态
     */
    getFormatState(): FormatState {
        if (!this.editor) {
            return {
                bold: false,
                italic: false,
                underline: false,
                code: false,
                strikethrough: false,
                subscript: false,
                superscript: false,
                highlight: false,
            };
        }

        return this.editor.getEditorState().read(() => {
            // TODO: 使用 @lexical/selection 获取格式状态
            return {
                bold: false,
                italic: false,
                underline: false,
                code: false,
                strikethrough: false,
                subscript: false,
                superscript: false,
                highlight: false,
            };
        });
    }

    /**
     * 销毁服务
     */
    destroy(): void {
        if (this.disposed) {
            return;
        }

        this.disposed = true;
        this.store.reset();
        // 清理编辑器资源
    }
}

/**
 * 创建 EditorService 的工厂函数
 * @param documentId 文档 ID
 * @param filePath 文件路径
 * @returns EditorService 实例
 */
export function createEditorService(
    documentId: string,
    filePath: string,
): EditorService {
    // 创建 Zustand store
    const store = createEditorStore();

    // 创建并返回 EditorService 实例
    return new EditorServiceImpl(documentId, filePath, store);
}
