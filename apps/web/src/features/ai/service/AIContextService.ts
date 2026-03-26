/**
 * AIContextService - AI 上下文服务
 *
 * 负责收集和提供编辑器的上下文信息给 AI Panel
 * 支持按需请求和事件推送两种模式
 */

import { ServiceBase } from '@/platform/base/service-base';
import { Emitter } from '../../../base/common/event';
import type { EditorService } from '../../editor/service';
import type { FormatState, Position } from '../../editor/types';

/**
 * 文档信息接口
 */
interface DocumentInfo {
    id: string;
    path: string;
    title: string;
    type: string;
}

/**
 * 选区信息接口
 */
interface SelectionInfo {
    text: string;
    from: Position;
    to: Position;
    length: number;
}

/**
 * AI 上下文接口
 * 包含 AI Panel 需要的所有编辑器状态信息
 */
export interface AIContext {
    document: DocumentInfo;
    selection: SelectionInfo | null;
    fullContent: string | null;
    cursorPosition: Position | null;
    formatState: FormatState | null;
}

/**
 * AI 上下文订阅者接口
 */
export interface AIContextSubscriber {
    id: string;
    onContextChange: (context: AIContext) => void;
}

/**
 * 内部订阅者信息
 */
interface SubscriberEntry {
    id: string;
    onContextChange: (context: AIContext) => void;
}

/**
 * AIContextService 接口定义
 */
export interface AIContextService {
    /**
     * 获取上下文（按需请求）
     * @param documentId - 文档 ID
     * @returns AI 上下文或 null
     */
    getContext(documentId: string): Promise<AIContext | null>;

    /**
     * 订阅上下文变化（事件推送）
     * @param documentId - 文档 ID
     * @param subscriber - 订阅者
     */
    subscribe(documentId: string, subscriber: AIContextSubscriber): void;

    /**
     * 取消订阅
     * @param documentId - 文档 ID
     * @param subscriberId - 订阅者 ID
     */
    unsubscribe(documentId: string, subscriberId: string): void;

    /**
     * 通知上下文变化（内部使用）
     * @param documentId - 文档 ID
     */
    notifyContextChange(documentId: string): void;

    /**
     * 注册编辑器服务（用于获取上下文）
     * @param documentId - 文档 ID
     * @param editorService - 编辑器服务实例
     */
    registerEditor(documentId: string, editorService: EditorService): void;

    /**
     * 销毁服务
     */
    dispose(): void;
}

/**
 * AIContextService 实现类
 */
class AIContextServiceImpl extends ServiceBase implements AIContextService {
    /** 存储已注册的编辑器服务 */
    private _editors: Map<string, EditorService> = new Map();

    /** 存储订阅者，key 为 documentId，value 为订阅者数组 */
    private _subscribers: Map<string, Map<string, SubscriberEntry>> = new Map();

    /** 上下文变化事件发射器 */
    private _contextChangeEmitter: Emitter<{ documentId: string; context: AIContext }> =
        new Emitter<{ documentId: string; context: AIContext }>({ copyListeners: true });

    /**
     * 获取上下文（按需请求）
     * @param documentId - 文档 ID
     * @returns AI 上下文或 null
     */
    async getContext(documentId: string): Promise<AIContext | null> {
        if (this._isDisposed) {
            throw new Error('AIContextService has been destroyed');
        }

        const editorService = this._editors.get(documentId);
        if (!editorService) {
            return null;
        }

        try {
            // 获取文档信息
            const store = editorService.store;
            const document = store.document;

            if (!document) {
                return null;
            }

            // 获取选区信息
            const selection = editorService.getSelection();
            const selectionInfo: SelectionInfo | null = selection
                ? {
                      text: selection.text,
                      from: selection.anchor,
                      to: selection.head,
                      length: selection.text.length,
                  }
                : null;

            // 获取完整内容
            const fullContent = editorService.getFullContent();

            // 获取光标位置（如果有选区，使用选区结束位置作为光标位置）
            const cursorPosition: Position | null = selection ? selection.head : null;

            // 获取格式状态
            const formatState = editorService.getFormatState();

            const context: AIContext = {
                document: {
                    id: document.id,
                    path: document.path,
                    title: document.title,
                    type: document.type,
                },
                selection: selectionInfo,
                fullContent: fullContent || null,
                cursorPosition,
                formatState,
            };

            return context;
        } catch (error) {
            console.error(`Failed to get context for document ${documentId}:`, error);
            return null;
        }
    }

    /**
     * 订阅上下文变化（事件推送）
     * @param documentId - 文档 ID
     * @param subscriber - 订阅者
     */
    subscribe(documentId: string, subscriber: AIContextSubscriber): void {
        if (this._isDisposed) {
            throw new Error('AIContextService has been destroyed');
        }

        // 获取或创建订阅者 Map
        let docSubscribers = this._subscribers.get(documentId);
        if (!docSubscribers) {
            docSubscribers = new Map<string, SubscriberEntry>();
            this._subscribers.set(documentId, docSubscribers);
        }

        // 添加订阅者
        docSubscribers.set(subscriber.id, {
            id: subscriber.id,
            onContextChange: subscriber.onContextChange,
        });
    }

    /**
     * 取消订阅
     * @param documentId - 文档 ID
     * @param subscriberId - 订阅者 ID
     */
    unsubscribe(documentId: string, subscriberId: string): void {
        if (this._isDisposed) {
            return;
        }

        const docSubscribers = this._subscribers.get(documentId);
        if (docSubscribers) {
            docSubscribers.delete(subscriberId);

            // 如果没有订阅者了，清理该文档的订阅记录
            if (docSubscribers.size === 0) {
                this._subscribers.delete(documentId);
            }
        }
    }

    /**
     * 通知上下文变化（内部使用）
     * @param documentId - 文档 ID
     */
    notifyContextChange(documentId: string): void {
        if (this._isDisposed) {
            return;
        }

        const docSubscribers = this._subscribers.get(documentId);
        if (!docSubscribers || docSubscribers.size === 0) {
            return;
        }

        // 获取最新上下文
        const contextPromise = this.getContext(documentId);

        contextPromise
            .then(context => {
                if (!context) {
                    return;
                }

                // 通知所有订阅者
                for (const subscriber of docSubscribers.values()) {
                    try {
                        subscriber.onContextChange(context);
                    } catch (error) {
                        console.error(
                            `Error in subscriber ${subscriber.id} for document ${documentId}:`,
                            error,
                        );
                    }
                }

                // 触发全局事件
                this._contextChangeEmitter.fire({ documentId, context });
            })
            .catch(error => {
                console.error(`Failed to notify context change for document ${documentId}:`, error);
            });
    }

    /**
     * 注册编辑器服务（用于获取上下文）
     * @param documentId - 文档 ID
     * @param editorService - 编辑器服务实例
     */
    registerEditor(documentId: string, editorService: EditorService): void {
        if (this._isDisposed) {
            throw new Error('AIContextService has been destroyed');
        }

        this._editors.set(documentId, editorService);
    }

    /**
     * 销毁服务
     */
    override dispose(): void {
        if (this._isDisposed) {
            return;
        }

        this._subscribers.clear();
        this._editors.clear();
        this._contextChangeEmitter.dispose();
        super.dispose();
    }
}

/**
 * 创建 AIContextService 的工厂函数
 * @returns AIContextService 实例
 */
export function createAIContextService(): AIContextService {
    return new AIContextServiceImpl();
}
