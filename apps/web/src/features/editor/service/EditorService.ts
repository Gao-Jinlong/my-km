/**
 * EditorService - 单个编辑器的业务逻辑服务
 */

import type { LexicalEditor } from 'lexical';
import {
    $createTextNode,
    $getRoot,
    $getSelection,
    $isElementNode,
    $isRangeSelection,
} from 'lexical';
import { Emitter } from '@/base/common/event';
import type { IDisposable } from '@/base/common/lifecycle';
import { container } from '@/platform/bootstrap';
import type { FileSystemService } from '@/platform/file-system/service';
import { blocksToLexical, lexicalToBlocks } from '../converter/block-lexical-converter';
import { serializeToKmFile } from '../converter/km-serializer';
import type { Document, FormatState, Selection } from '../types';

/**
 * 文档保存结果
 */
export interface SaveResult {
    success: boolean;
    document?: Document;
    error?: string;
}

/**
 * 编辑器状态
 */
export interface EditorState {
    isDirty: boolean;
    isSaving: boolean;
    isSaved: boolean;
    hasError: boolean;
    isReadonly: boolean;
    error: string | null;
}

/**
 * EditorService 接口定义
 */
export interface EditorService {
    // 属性
    readonly documentId: string;
    readonly filePath: string;
    readonly isDisposed: boolean;

    // 事件
    readonly onChange: (listener: (state: EditorState) => void) => IDisposable;

    // 编辑器实例（从 React 组件注入）
    setEditor(editor: LexicalEditor): void;
    getEditor(): LexicalEditor | null;

    // 文档操作
    loadDocument(doc: Document): void;
    saveDocument(): Promise<SaveResult>;

    // 状态获取
    getState(): EditorState;
    getSelection(): Selection | null;
    getSelectedText(): string | null;
    getFullContent(): string;
    getFormatState(): FormatState;

    // 编辑器操作
    insertTextAtCursor(text: string): void;
    replaceSelection(text: string): void;

    // 生命周期
    destroy(): void;
}

/**
 * 创建空格式状态
 */
function createEmptyFormatState(): FormatState {
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

/**
 * EditorService 实现类
 */
class EditorServiceImpl implements EditorService {
    readonly documentId: string;
    readonly filePath: string;

    // 事件发射器
    private readonly _onChange = new Emitter<EditorState>();

    // 内部状态
    private editor: LexicalEditor | null = null;
    private updateListenerCleanup: (() => void) | null = null;
    private disposed: boolean = false;
    private isDirty = false;
    private isSaving = false;
    private isSaved = false;
    private savedTimer: ReturnType<typeof setTimeout> | null = null;
    private error: string | null = null;
    private isReadonly = false;
    private suppressDirty = false;
    private currentDocument: Document | null = null;
    private hasChangesDuringSave = false;

    get isDisposed(): boolean {
        return this.disposed;
    }

    constructor(documentId: string, filePath: string) {
        this.documentId = documentId;
        this.filePath = filePath;
    }

    // ========== 事件 ==========

    get onChange() {
        return this._onChange.event;
    }

    // ========== 状态 getter ==========

    getState(): EditorState {
        return {
            isDirty: this.isDirty,
            isSaving: this.isSaving,
            isSaved: this.isSaved,
            hasError: this.error !== null,
            isReadonly: this.isReadonly,
            error: this.error,
        };
    }

    getFormatState(): FormatState {
        if (!this.editor) {
            return createEmptyFormatState();
        }

        return this.editor.getEditorState().read(() => {
            const selection = $getSelection();
            if (!$isRangeSelection(selection)) {
                return createEmptyFormatState();
            }
            return {
                bold: selection.hasFormat('bold'),
                italic: selection.hasFormat('italic'),
                underline: selection.hasFormat('underline'),
                code: selection.hasFormat('code'),
                strikethrough: selection.hasFormat('strikethrough'),
                subscript: selection.hasFormat('subscript'),
                superscript: selection.hasFormat('superscript'),
                highlight: selection.hasFormat('highlight'),
            };
        });
    }

    // ========== 状态 setter ==========

    private setState(newState: Partial<EditorState>): void {
        if (newState.isDirty !== undefined) this.isDirty = newState.isDirty;
        if (newState.isSaving !== undefined) this.isSaving = newState.isSaving;
        if (newState.isSaved !== undefined) this.isSaved = newState.isSaved;
        if (newState.error !== undefined) this.error = newState.error;
        if (newState.isReadonly !== undefined) this.isReadonly = newState.isReadonly;
        this._onChange.fire(this.getState());
    }

    // ========== 编辑器实例 ==========

    setEditor(editor: LexicalEditor): void {
        // 清理旧的 update listener，防止泄漏
        if (this.updateListenerCleanup) {
            this.updateListenerCleanup();
        }

        this.editor = editor;

        // 注册 Lexical 更新监听器，内容变化时标记为 dirty
        this.updateListenerCleanup = editor.registerUpdateListener(
            ({ dirtyElements, dirtyLeaves }) => {
                if (this.suppressDirty) return;
                if ((dirtyElements?.size ?? 0) > 0 || (dirtyLeaves?.size ?? 0) > 0) {
                    // 如果在保存过程中有变更，记录标志
                    if (this.isSaving) {
                        this.hasChangesDuringSave = true;
                    }
                    this.setState({ isDirty: true });
                }
            },
        );

        // 如果文档在 Lexical 挂载前已加载，重放到编辑器
        if (this.currentDocument) {
            this.loadDocument(this.currentDocument);
        }
    }

    getEditor(): LexicalEditor | null {
        return this.editor;
    }

    // ========== 文档操作 ==========

    loadDocument(doc: Document): void {
        if (this.disposed) {
            throw new Error('EditorService has been destroyed');
        }

        try {
            this.currentDocument = doc;
            this.setState({
                isReadonly: false,
                isDirty: false,
                error: null,
            });

            // 将文档内容加载到 Lexical 编辑器
            if (this.editor) {
                this.suppressDirty = true;
                blocksToLexical(doc.content, this.editor);
                // 等 Lexical 所有级联更新（如 AutoFocusPlugin）结束后再恢复 dirty 检测
                // onUpdate 哨兵不够：AutoFocusPlugin 的 focus 更新可能在哨兵之后排队
                setTimeout(() => {
                    this.suppressDirty = false;
                }, 0);
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Failed to load document';
            this.setState({ error: errorMessage });
            throw error;
        }
    }

    async saveDocument(): Promise<SaveResult> {
        if (this.disposed) {
            return {
                success: false,
                error: 'EditorService has been destroyed',
            };
        }

        if (this.isReadonly) {
            return {
                success: false,
                error: 'Document is in readonly mode',
            };
        }

        try {
            if (!this.editor) {
                return {
                    success: false,
                    error: 'Editor not initialized',
                };
            }

            this.setState({ isSaving: true });

            // 重置保存过程中的变更标志
            this.hasChangesDuringSave = false;

            // 从 Lexical 获取当前内容
            const blocks = lexicalToBlocks(this.editor);

            // 获取当前文档
            if (!this.currentDocument) {
                return {
                    success: false,
                    error: 'No document loaded',
                };
            }

            const updatedDoc: Document = {
                ...this.currentDocument,
                content: blocks,
                version: this.currentDocument.version + 1,
                updatedAt: new Date().toISOString(),
            };

            const fileContent = serializeToKmFile(blocks, {
                title: updatedDoc.title,
                createdAt: updatedDoc.createdAt,
                updatedAt: updatedDoc.updatedAt,
            });

            // 写入文件
            const fileSystem = container.get('FileSystemService') as FileSystemService;
            await fileSystem.writeFile(this.filePath, fileContent);

            // 保存完成后，检查是否有新的变更
            // 如果有，保持 isDirty = true，只清除 isSaving 状态
            // 如果没有，重置 isDirty = false，设置 isSaved = true
            if (this.hasChangesDuringSave) {
                // 保存过程中有新变更，保持 dirty 状态
                this.setState({ isSaving: false, isSaved: false });
            } else {
                // 保存过程中无新变更，成功保存
                this.setState({ isDirty: false, isSaving: false, isSaved: true });

                // 2 秒后清除"已保存"状态
                if (this.savedTimer) clearTimeout(this.savedTimer);
                this.savedTimer = setTimeout(() => {
                    this.setState({ isSaved: false });
                }, 2000);
            }

            return {
                success: true,
                document: updatedDoc,
            };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Failed to save document';
            this.setState({ error: errorMessage, isSaving: false });
            return {
                success: false,
                error: errorMessage,
            };
        }
    }

    // ========== 其他方法 ==========

    getSelection(): Selection | null {
        if (!this.editor) {
            return null;
        }

        let result: Selection | null = null;
        this.editor.getEditorState().read(() => {
            const sel = $getSelection();
            if (!$isRangeSelection(sel)) {
                return;
            }
            const anchor = sel.anchor;
            const head = sel.focus;
            const text = sel.getTextContent();
            result = {
                anchor: { blockId: anchor.key, offset: anchor.offset },
                head: { blockId: head.key, offset: head.offset },
                text,
            };
        });

        return result;
    }

    getSelectedText(): string | null {
        const selection = this.getSelection();
        return selection?.text ?? null;
    }

    insertTextAtCursor(text: string): void {
        if (!this.editor) {
            return;
        }
        this.editor.update(() => {
            const selection = $getSelection();
            if ($isRangeSelection(selection)) {
                selection.insertText(text);
            } else {
                const node = $createTextNode(text);
                const root = $getRoot();
                const lastChild = root.getLastChild();
                if (lastChild && $isElementNode(lastChild)) {
                    lastChild.append(node);
                } else {
                    root.append(node);
                }
            }
        });
    }

    replaceSelection(text: string): void {
        if (!this.editor) {
            return;
        }
        this.editor.update(() => {
            const selection = $getSelection();
            if ($isRangeSelection(selection) && !selection.isCollapsed()) {
                selection.removeText();
                selection.insertText(text);
            }
        });
    }

    getFullContent(): string {
        if (!this.editor) {
            return '';
        }

        return this.editor.getEditorState().read(() => {
            return $getRoot().getTextContent();
        });
    }

    destroy(): void {
        if (this.disposed) {
            return;
        }

        // 清理 Lexical 更新监听器
        if (this.updateListenerCleanup) {
            this.updateListenerCleanup();
            this.updateListenerCleanup = null;
        }

        if (this.savedTimer) {
            clearTimeout(this.savedTimer);
            this.savedTimer = null;
        }

        this.disposed = true;
        this._onChange.dispose();
    }
}

/**
 * 创建 EditorService 的工厂函数
 * @param documentId 文档 ID
 * @param filePath 文件路径
 * @returns EditorService 实例
 */
export function createEditorService(documentId: string, filePath: string): EditorService {
    return new EditorServiceImpl(documentId, filePath);
}
