/**
 * EditorContainer - 编辑器实例容器
 *
 * 负责：
 * - 管理多个编辑器实例（多文档编辑）
 * - 编辑器实例的创建和销毁
 * - 编辑器与文件系统的集成
 */

import type { Document } from '@/features/editor/types';
import { ServiceBase } from '@/platform/base/service-base';
import { Service } from '@/platform/di';

/**
 * 编辑器配置
 */
export interface EditorConfig {
    /** 命名空间 */
    namespace?: string;
    /** 主题配置 */
    theme?: Record<string, unknown>;
    /** 是否只读 */
    readOnly?: boolean;
}

/**
 * 编辑器服务接口
 */
export interface IEditorService {
    /** 文档 ID */
    readonly documentId: string;
    /** 是否已销毁 */
    readonly isDisposed: boolean;

    /** 创建编辑器 */
    create(container: HTMLElement, config?: EditorConfig): void;
    /** 加载文档 */
    loadDocument(document: Document): void;
    /** 保存文档 */
    saveDocument(): Promise<void>;
    /** 销毁编辑器 */
    destroy(): void;
}

/**
 * 编辑器容器服务
 *
 * @example
 * ```typescript
 * const editorContainer = container.get(EditorContainer);
 *
 * // 创建编辑器实例
 * const editor = editorContainer.createInstance('doc-123');
 * editor.create(containerElement);
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
     * @returns 编辑器服务实例
     *
     * @example
     * ```typescript
     * const editor = editorContainer.createInstance('doc-123');
     * ```
     */
    createInstance(documentId: string): IEditorService {
        // 检查是否已存在
        const existing = this.editors.get(documentId);
        if (existing) {
            return existing;
        }

        // TODO: 创建实际的编辑器实例
        // 这里需要实现 EditorService 类
        throw new Error(
            `EditorService not yet implemented. ` +
                `Please implement EditorService class that implements IEditorService.`,
        );
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
