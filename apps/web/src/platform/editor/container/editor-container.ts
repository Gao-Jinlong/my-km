/**
 * EditorContainer - 编辑器实例容器
 *
 * 负责：
 * - 管理多个编辑器实例（多文档编辑）
 * - 编辑器实例的创建和销毁
 * - 编辑器与文件系统的集成
 */

import type { EditorService } from '@/features/editor/service/EditorService';
import { createEditorService } from '@/features/editor/service/EditorService';
import { ServiceBase } from '@/platform/base/service-base';
import { Service } from '@/platform/di';

/**
 * 编辑器服务接口
 */
export interface IEditorService {
    /** 文档 ID */
    readonly documentId: string;
    /** 文件路径 */
    readonly filePath: string;
    /** 是否已销毁 */
    readonly isDisposed: boolean;

    /** 订阅状态变化事件 */
    readonly onChange: (listener: (state: any) => void) => any;

    /** 设置 Lexical 编辑器实例 */
    setEditor(editor: any): void;
    /** 获取 Lexical 编辑器实例 */
    getEditor(): any | null;
    /** 加载文档 */
    loadDocument(document: any): void;
    /** 保存文档 */
    saveDocument(): Promise<any>;
    /** 销毁编辑器 */
    destroy(): void;

    /** 获取状态 */
    getState(): any;
    /** 获取选区 */
    getSelection(): any | null;
    /** 获取选中文本 */
    getSelectedText(): string | null;
    /** 获取完整内容 */
    getFullContent(): string;
    /** 获取格式状态 */
    getFormatState(): any;
}

/**
 * 编辑器容器服务
 *
 * @example
 * ```typescript
 * const editorContainer = container.get(EditorContainer);
 *
 * // 创建编辑器实例
 * const editor = editorContainer.createInstance('doc-123', 'path/to/file.md');
 * editor.setEditor(lexicalEditor);
 * editor.loadDocument(doc);
 * ```
 */
@Service({ singleton: true })
export class EditorContainer extends ServiceBase {
    /** 编辑器实例映射表 */
    private editors: Map<string, IEditorService> = new Map();

    /**
     * 创建编辑器实例
     *
     * @param documentId 文档 ID
     * @param filePath 文件路径
     * @returns 编辑器服务实例
     *
     * @example
     * ```typescript
     * const editor = editorContainer.createInstance('doc-123', 'path/to/file.md');
     * ```
     */
    createInstance(documentId: string, filePath: string): IEditorService {
        // 检查是否已存在
        const existing = this.editors.get(documentId);
        if (existing) {
            return existing;
        }

        // 创建实际的编辑器实例
        const editorService = createEditorService(documentId, filePath);
        this.editors.set(documentId, editorService);

        return editorService;
    }

    /**
     * 获取编辑器实例
     *
     * @param documentId 文档 ID
     * @returns 编辑器服务实例或 null
     */
    getInstance(documentId: string): IEditorService | null {
        return this.editors.get(documentId) || null;
    }

    /**
     * 获取编辑器服务（类型安全版本）
     *
     * @param documentId 文档 ID
     * @returns EditorService 实例或 null
     */
    getService(documentId: string): EditorService | null {
        return (this.editors.get(documentId) as EditorService) || null;
    }

    /**
     * 销毁编辑器实例
     *
     * @param documentId 文档 ID
     */
    disposeInstance(documentId: string): void {
        const editor = this.editors.get(documentId);
        if (editor) {
            editor.destroy();
            this.editors.delete(documentId);
        }
    }

    /**
     * 销毁所有编辑器实例
     */
    disposeAll(): void {
        for (const editor of this.editors.values()) {
            editor.destroy();
        }
        this.editors.clear();
    }

    override dispose(): void {
        this.disposeAll();
        super.dispose();
    }
}
