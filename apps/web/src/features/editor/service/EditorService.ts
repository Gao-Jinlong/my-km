/**
 * EditorService - 单个编辑器的业务逻辑服务
 *
 * 负责管理单个 Lexical Editor 实例，提供文档操作、选区管理、命令执行等功能
 */

import type { LexicalEditor } from 'lexical';
import { createEditor } from 'lexical';
import type { BlockRegistry } from '../registry/BlockRegistry';
import type { EditorStoreApi } from '../store/editor-store';
import { createEditorStore } from '../store/editor-store';
import type { Block, Document, FormatState, Selection } from '../types';

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
    editor: LexicalEditor;
    store: EditorStoreApi;

    // 文档操作
    loadDocument(doc: Document): void;
    saveDocument(): Promise<SaveResult>;

    // 选区与内容
    getSelection(): Selection | null;
    getSelectedText(): string | null;
    getFullContent(): string;
    getFormatState(): FormatState;

    // 命令执行
    insertBlock(block: Block): void;
    updateBlock(blockId: string, content: Record<string, any>): void;
    deleteBlock(blockId: string): void;

    // 生命周期
    destroy(): void;
}

/**
 * EditorService 实现类
 */
class EditorServiceImpl implements EditorService {
    documentId: string;
    editor: LexicalEditor;
    store: EditorStoreApi;
    private disposed: boolean = false;

    constructor(documentId: string, editor: LexicalEditor, store: EditorStoreApi) {
        this.documentId = documentId;
        this.editor = editor;
        this.store = store;

        // 初始化编辑器事件监听
        this.setupEditorListeners();
    }

    /**
     * 设置编辑器事件监听
     */
    private setupEditorListeners(): void {
        // 监听选区变化
        this.editor.registerUpdateListener(({ editorState }) => {
            editorState.read(() => {
                const selection = this.getSelection();
                this.store.setSelection(selection);

                const formatState = this.getFormatState();
                this.store.setFormatState(formatState);
            });
        });
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
            this.editor.update(() => {
                // TODO: 实现将 Block[] 转换为 Lexical 节点的逻辑
                // 这需要在后续实现 Lexical 自定义节点
            });
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
            // 从 Lexical 编辑器获取当前内容
            const content = this.editor.getEditorState().read(() => {
                // TODO: 实现从 Lexical 节点转换为 Block[] 的逻辑
                return [] as Block[];
            });

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
                content,
                version: currentDoc.version + 1,
                updatedAt: new Date().toISOString(),
            };

            this.store.setDocument(updatedDoc);
            this.store.markClean();

            // TODO: 调用实际的保存 API
            // await saveDocumentToStorage(updatedDoc);

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
        const lexicalSelection = this.editor.getEditorState().read(() => {
            // TODO: 使用 @lexical/selection 获取选区
            return null;
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
        return this.editor.getEditorState().read(() => {
            // TODO: 从 Lexical 编辑器提取纯文本
            return '';
        });
    }

    /**
     * 获取当前格式状态
     * @returns 当前格式状态
     */
    getFormatState(): FormatState {
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
     * 插入块
     * @param _block 要插入的块
     */
    insertBlock(_block: Block): void {
        if (this.disposed) {
            throw new Error('EditorService has been destroyed');
        }

        this.editor.update(() => {
            // TODO: 实现将 Block 插入到 Lexical 编辑器的逻辑
            this.store.markDirty();
        });
    }

    /**
     * 更新块内容
     * @param _blockId 块 ID
     * @param _content 新的内容
     */
    updateBlock(_blockId: string, _content: Record<string, any>): void {
        if (this.disposed) {
            throw new Error('EditorService has been destroyed');
        }

        this.editor.update(() => {
            // TODO: 实现根据 blockId 查找并更新块的逻辑
            this.store.markDirty();
        });
    }

    /**
     * 删除块
     * @param _blockId 要删除的块 ID
     */
    deleteBlock(_blockId: string): void {
        if (this.disposed) {
            throw new Error('EditorService has been destroyed');
        }

        this.editor.update(() => {
            // TODO: 实现根据 blockId 删除块的逻辑
            this.store.markDirty();
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
 * @param blockRegistry 块注册中心
 * @returns EditorService 实例
 */
export function createEditorService(
    documentId: string,
    _blockRegistry: BlockRegistry,
): EditorService {
    // 创建 Lexical 编辑器实例
    const editor = createLexicalEditor();

    // 创建 Zustand store
    const store = createEditorStore();

    // 创建并返回 EditorService 实例
    return new EditorServiceImpl(documentId, editor, store);
}

/**
 * 创建 Lexical 编辑器实例
 * @returns Lexical 编辑器实例
 */
function createLexicalEditor(): LexicalEditor {
    return createEditor({
        namespace: 'EditorService',
        onError: error => {
            console.error('Lexical editor error:', error);
        },
    });
}
