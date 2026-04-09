/**
 * 编辑器标签页服务
 *
 * 管理打开/激活的文档，替代 zustand editor-ui-store
 */

import { Emitter } from '@/base/common/event';
import { ServiceBase } from '@/platform/base/service-base';
import { Service } from '@/platform/di';
import type { OpenDocument } from './types';

/**
 * 编辑器标签页服务
 *
 * 管理所有打开的文档标签，跟踪激活文档，
 * 并通过事件通知外部订阅者状态变化。
 *
 * @example
 * ```typescript
 * const tabService = container.get(EditorTabService);
 *
 * tabService.onDidChangeActive((id) => {
 *     console.log('Active document changed:', id);
 * });
 *
 * tabService.openDocument({
 *     id: 'doc-1',
 *     path: '/notes/hello.md',
 *     title: 'Hello',
 *     type: 'markdown',
 *     openedAt: new Date().toISOString(),
 * });
 * ```
 */
@Service({ singleton: true })
export class EditorTabService extends ServiceBase {
    private _openDocuments: OpenDocument[] = [];
    private _activeDocumentId: string | null = null;

    // 事件发射器
    private readonly _onDidOpenDocument = new Emitter<OpenDocument>();
    private readonly _onDidCloseDocument = new Emitter<string>();
    private readonly _onDidChangeActive = new Emitter<string | null>();
    private readonly _onDidChangeDocuments = new Emitter<void>();

    /** 文档已打开事件 */
    readonly onDidOpenDocument = this._onDidOpenDocument.event;

    /** 文档已关闭事件（参数为文档 ID） */
    readonly onDidCloseDocument = this._onDidCloseDocument.event;

    /** 激活文档变化事件（参数为新的激活文档 ID） */
    readonly onDidChangeActive = this._onDidChangeActive.event;

    /** 文档列表通用变化事件 */
    readonly onDidChangeDocuments = this._onDidChangeDocuments.event;

    /**
     * 打开文档
     *
     * 如果文档已存在于列表中，则直接激活它；
     * 否则将其添加到列表并激活。
     */
    openDocument(doc: OpenDocument): void {
        const existing = this._openDocuments.find(d => d.id === doc.id);

        if (existing) {
            // 文档已打开，仅激活
            this._activeDocumentId = doc.id;
            this._onDidChangeActive.fire(this._activeDocumentId);
            this._onDidChangeDocuments.fire();
            return;
        }

        // 添加新文档并激活
        this._openDocuments.push(doc);
        this._activeDocumentId = doc.id;
        this._onDidOpenDocument.fire(doc);
        this._onDidChangeActive.fire(this._activeDocumentId);
        this._onDidChangeDocuments.fire();
    }

    /**
     * 关闭文档
     *
     * 关闭指定文档。如果关闭的是当前激活文档，
     * 会自动激活相邻文档（同索引位置或前一个）。
     *
     * 注意：允许关闭最后一个文档（activeDocumentId 变为 null）。
     */
    closeDocument(id: string): void {
        const index = this._openDocuments.findIndex(d => d.id === id);
        if (index === -1) {
            return;
        }

        const wasActive = this._activeDocumentId === id;
        this._openDocuments.splice(index, 1);

        this._onDidCloseDocument.fire(id);

        if (wasActive) {
            // 自动激活相邻文档
            if (this._openDocuments.length === 0) {
                this._activeDocumentId = null;
            } else {
                const nextIndex = Math.min(index, this._openDocuments.length - 1);
                this._activeDocumentId = this._openDocuments[nextIndex].id;
            }
            this._onDidChangeActive.fire(this._activeDocumentId);
        }

        this._onDidChangeDocuments.fire();
    }

    /**
     * 激活文档
     */
    activateDocument(id: string): void {
        if (this._activeDocumentId === id) {
            return;
        }

        this._activeDocumentId = id;
        this._onDidChangeActive.fire(this._activeDocumentId);
        this._onDidChangeDocuments.fire();
    }

    /**
     * 更新文档属性
     */
    updateDocument(id: string, updates: Partial<OpenDocument>): void {
        const doc = this._openDocuments.find(d => d.id === id);
        if (!doc) {
            return;
        }

        Object.assign(doc, updates);
        this._onDidChangeDocuments.fire();
    }

    /**
     * 关闭除指定文档外的所有文档
     */
    closeOtherDocuments(keepId: string): void {
        const toClose = this._openDocuments.filter(d => d.id !== keepId);

        if (toClose.length === 0) {
            return;
        }

        this._openDocuments = this._openDocuments.filter(d => d.id === keepId);

        // 为每个关闭的文档触发事件
        for (const doc of toClose) {
            this._onDidCloseDocument.fire(doc.id);
        }

        // 激活保留的文档
        this._activeDocumentId = keepId;
        this._onDidChangeActive.fire(this._activeDocumentId);
        this._onDidChangeDocuments.fire();
    }

    /**
     * 关闭所有文档
     */
    closeAllDocuments(): void {
        if (this._openDocuments.length === 0) {
            return;
        }

        const closedIds = this._openDocuments.map(d => d.id);
        this._openDocuments = [];
        this._activeDocumentId = null;

        for (const id of closedIds) {
            this._onDidCloseDocument.fire(id);
        }

        this._onDidChangeActive.fire(null);
        this._onDidChangeDocuments.fire();
    }

    /**
     * 获取所有打开的文档（返回副本）
     */
    getOpenDocuments(): OpenDocument[] {
        return [...this._openDocuments];
    }

    /**
     * 获取当前激活文档的 ID
     */
    getActiveDocumentId(): string | null {
        return this._activeDocumentId;
    }

    /**
     * 获取当前激活的文档
     */
    getActiveDocument(): OpenDocument | undefined {
        if (this._activeDocumentId === null) {
            return undefined;
        }
        return this._openDocuments.find(d => d.id === this._activeDocumentId);
    }

    override dispose(): void {
        this._openDocuments = [];
        this._activeDocumentId = null;
        this._onDidOpenDocument.dispose();
        this._onDidCloseDocument.dispose();
        this._onDidChangeActive.dispose();
        this._onDidChangeDocuments.dispose();
        super.dispose();
    }
}
