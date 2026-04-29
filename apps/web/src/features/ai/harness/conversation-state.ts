/**
 * ConversationState — AI 本地对话状态管理子模块
 *
 * 负责维护本地消息列表、生成中状态等。
 * 仅通过 Emitter 向 Harness 发事件，不直接调用其他子模块。
 */

import { Emitter, type Event } from '@/base/common/event';
import { Disposable } from '@/base/common/lifecycle';
import type { MessageWire } from '../types/ai.types';

/**
 * ConversationState 接口
 */
export interface ConversationState {
    get messages(): ReadonlyArray<MessageWire>;
    get isGenerating(): boolean;
    get conversationId(): string | null;
    setConversationId(id: string | null): void;
    addMessage(message: MessageWire): void;
    appendStreamChunk(content: string): void;
    startGenerating(): void;
    stopGenerating(): void;
    setHistory(messages: MessageWire[]): void;
    clear(): void;
    get onStateChange(): Event<{ messages: MessageWire[]; isGenerating: boolean }>;
    get onStreamChunk(): Event<{ content: string }>;
    dispose(): void;
}

class ConversationStateImpl extends Disposable implements ConversationState {
    private _messages: MessageWire[] = [];
    private _isGenerating = false;
    private _conversationId: string | null = null;
    private _currentAssistantMessage: MessageWire | null = null;

    // 事件
    private _onStateChange = new Emitter<{ messages: MessageWire[]; isGenerating: boolean }>();
    private _onStreamChunk = new Emitter<{ content: string }>();

    get messages(): ReadonlyArray<MessageWire> {
        return this._messages;
    }

    get isGenerating(): boolean {
        return this._isGenerating;
    }

    get conversationId(): string | null {
        return this._conversationId;
    }

    setConversationId(id: string | null): void {
        this._conversationId = id;
    }

    /**
     * 添加新消息（用户消息、工具结果等）
     */
    addMessage(message: MessageWire): void {
        this._messages.push(message);
        this._onStateChange.fire({
            messages: [...this._messages],
            isGenerating: this._isGenerating,
        });
    }

    /**
     * 开始生成助手消息
     */
    startGenerating(): void {
        if (this._isGenerating) {
            return;
        }
        this._isGenerating = true;
        this._currentAssistantMessage = {
            id: `stream-${Date.now()}`,
            role: 'assistant',
            content: '',
            createdAt: new Date().toISOString(),
        };
        this._messages.push(this._currentAssistantMessage);
        this._onStateChange.fire({ messages: [...this._messages], isGenerating: true });
    }

    /**
     * 追加流式文本片段
     */
    appendStreamChunk(content: string): void {
        if (this._currentAssistantMessage) {
            this._currentAssistantMessage.content =
                (this._currentAssistantMessage.content ?? '') + content;
        }
        // 流式片段只触发 onStreamChunk，不触发全量 onStateChange
        this._onStreamChunk.fire({ content });
    }

    /**
     * 停止生成
     */
    stopGenerating(): void {
        this._isGenerating = false;
        this._currentAssistantMessage = null;
        this._onStateChange.fire({ messages: [...this._messages], isGenerating: false });
    }

    /**
     * 设置历史消息（覆盖当前状态）
     */
    setHistory(messages: MessageWire[]): void {
        this._messages = [...messages];
        this._isGenerating = false;
        this._currentAssistantMessage = null;
        this._onStateChange.fire({ messages: [...this._messages], isGenerating: false });
    }

    /**
     * 清空对话
     */
    clear(): void {
        this._messages = [];
        this._isGenerating = false;
        this._currentAssistantMessage = null;
        this._onStateChange.fire({ messages: [], isGenerating: false });
    }

    /**
     * 状态变化事件
     */
    get onStateChange(): Event<{ messages: MessageWire[]; isGenerating: boolean }> {
        return this._onStateChange.event;
    }

    /**
     * 流式片段事件（UI 实时渲染用）
     */
    get onStreamChunk(): Event<{ content: string }> {
        return this._onStreamChunk.event;
    }

    override dispose(): void {
        this._messages = [];
        this._onStateChange.dispose();
        this._onStreamChunk.dispose();
        super.dispose();
    }
}

export function createConversationState(): ConversationState {
    return new ConversationStateImpl();
}
