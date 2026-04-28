/**
 * ContextCollector — AI 上下文收集子模块
 *
 * 负责从 Lexical 编辑器获取上下文信息（选中文本、光标位置、格式状态等）。
 * 从原 AIContextService 的核心逻辑迁移而来。
 */

import { Emitter, type Event } from '@/base/common/event';
import type { EditorService } from '@/features/editor/service';
import type { Position } from '@/features/editor/types';
import { getContainer } from '@/platform/bootstrap';
import { MonitorService } from '@/platform/monitor/service';
import type { AIContextWire } from '../types/ai.types';

function getLogger() {
    return getContainer().get(MonitorService).getLogger('context-collector');
}

interface DocumentMeta {
    id: string;
    title: string;
    path: string;
}

/**
 * ContextCollector 接口
 */
export interface ContextCollector {
    getContext(documentId: string): Promise<AIContextWire | null>;
    registerEditor(documentId: string, editorService: EditorService): void;
    unregisterEditor(documentId: string): void;
    setDocumentMeta(documentId: string, meta: DocumentMeta): void;
    get onContextChange(): Event<{ documentId: string; context: AIContextWire }>;
    dispose(): void;
}

class ContextCollectorImpl implements ContextCollector {
    private _editors = new Map<string, EditorService>();
    private _docMeta = new Map<string, DocumentMeta>();
    private _onContextChange = new Emitter<{ documentId: string; context: AIContextWire }>({
        copyListeners: true,
    });

    /**
     * 获取指定文档的 AI 上下文
     */
    async getContext(documentId: string): Promise<AIContextWire | null> {
        const editorService = this._editors.get(documentId);
        if (!editorService) {
            return null;
        }

        try {
            const fullContent = editorService.getFullContent();
            const selection = editorService.getSelection();
            const formatState = editorService.getFormatState();
            const meta = this._docMeta.get(documentId);

            const selectionInfo = selection
                ? {
                      text: selection.text,
                      from: selection.anchor,
                      to: selection.head,
                      length: selection.text.length,
                  }
                : null;

            const cursorPosition: Position | null = selection ? selection.head : null;

            return {
                documentId,
                documentTitle: meta?.title ?? '',
                documentPath: meta?.path ?? '',
                selectedText: selectionInfo?.text ?? null,
                fullContent: fullContent?.slice(0, 50 * 1024) ?? null, // 最大 50KB
                cursorPosition,
                formatState,
            };
        } catch (error) {
            getLogger().error(`Failed to get context for document ${documentId}:`, error);
            return null;
        }
    }

    /**
     * 注册编辑器实例
     */
    registerEditor(documentId: string, editorService: EditorService): void {
        this._editors.set(documentId, editorService);
    }

    /**
     * 取消注册编辑器实例
     */
    unregisterEditor(documentId: string): void {
        this._editors.delete(documentId);
    }

    /**
     * 设置文档元数据（标题、路径）
     */
    setDocumentMeta(documentId: string, meta: DocumentMeta): void {
        this._docMeta.set(documentId, meta);
    }

    /**
     * 上下文变化事件
     */
    get onContextChange(): Event<{ documentId: string; context: AIContextWire }> {
        return this._onContextChange.event;
    }

    /**
     * 通知上下文变化
     */
    notifyContextChange(documentId: string): void {
        this.getContext(documentId)
            .then(context => {
                if (context) {
                    this._onContextChange.fire({ documentId, context });
                }
            })
            .catch(error => {
                getLogger().error(`Failed to notify context change:`, error);
            });
    }

    dispose(): void {
        this._editors.clear();
        this._docMeta.clear();
        this._onContextChange.dispose();
    }
}

export function createContextCollector(): ContextCollector {
    return new ContextCollectorImpl();
}
