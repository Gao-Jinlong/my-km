/**
 * RoomState — AI 本地对话状态管理子模块
 *
 * 负责维护本地消息列表、生成中状态等。
 * 仅通过 Emitter 向 Harness 发事件，不直接调用其他子模块。
 */

import { Emitter, type Event } from '@/base/common/event';
import { Disposable } from '@/base/common/lifecycle';
import type { MessageWire } from '../types/ai.types';

/**
 * RoomState 接口
 */
export interface RoomState {
    get messages(): ReadonlyArray<MessageWire>;
    get isGenerating(): boolean;
    get isProcessing(): boolean;
    get roomId(): string | null;
    setRoomId(id: string | null): void;
    addMessage(message: MessageWire): void;
    removeMessage(id: string): void;
    appendStreamChunk(content: string): void;
    startGenerating(): void;
    stopGenerating(): void;
    setHistory(messages: MessageWire[]): void;
    clear(): void;
    get onStateChange(): Event<{
        messages: MessageWire[];
        isGenerating: boolean;
        isProcessing: boolean;
    }>;
    get onStreamChunk(): Event<{ content: string }>;
    dispose(): void;
}

class RoomStateImpl extends Disposable implements RoomState {
    private _messages: MessageWire[] = [];
    private _isGenerating = false;
    private _isProcessing = false;
    private _roomId: string | null = null;
    private _currentAssistantMessage: MessageWire | null = null;

    // 事件
    private _onStateChange = new Emitter<{
        messages: MessageWire[];
        isGenerating: boolean;
        isProcessing: boolean;
    }>();
    private _onStreamChunk = new Emitter<{ content: string }>();

    get messages(): ReadonlyArray<MessageWire> {
        return this._messages;
    }

    get isGenerating(): boolean {
        return this._isGenerating;
    }

    get isProcessing(): boolean {
        return this._isProcessing;
    }

    get roomId(): string | null {
        return this._roomId;
    }

    setRoomId(id: string | null): void {
        this._roomId = id;
    }

    /**
     * 添加新消息（用户消息、工具结果等）
     */
    addMessage(message: MessageWire): void {
        this._messages.push(message);
        this._onStateChange.fire({
            messages: [...this._messages],
            isGenerating: this._isGenerating,
            isProcessing: this._isProcessing,
        });
    }

    /**
     * 移除指定 ID 的消息（回滚用）
     */
    removeMessage(id: string): void {
        const idx = this._messages.findIndex(m => m.id === id);
        if (idx >= 0) {
            this._messages.splice(idx, 1);
            this._onStateChange.fire({
                messages: [...this._messages],
                isGenerating: this._isGenerating,
                isProcessing: this._isProcessing,
            });
        }
    }

    /**
     * 开始生成助手消息
     */
    startGenerating(): void {
        if (this._isGenerating) {
            return;
        }
        this._isGenerating = true;
        this._isProcessing = true;
        this._currentAssistantMessage = {
            id: `stream-${Date.now()}`,
            role: 'assistant',
            content: '',
            createdAt: new Date().toISOString(),
        };
        this._messages.push(this._currentAssistantMessage);
        this._onStateChange.fire({
            messages: [...this._messages],
            isGenerating: true,
            isProcessing: true,
        });
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
        // 清理空助手消息（服务端错误或连接断开时残留）
        if (this._currentAssistantMessage && !this._currentAssistantMessage.content) {
            const idx = this._messages.indexOf(this._currentAssistantMessage);
            if (idx >= 0) this._messages.splice(idx, 1);
        }
        this._isProcessing = false;
        this._isGenerating = false;
        this._currentAssistantMessage = null;
        this._onStateChange.fire({
            messages: [...this._messages],
            isGenerating: false,
            isProcessing: false,
        });
    }

    /**
     * 设置历史消息（覆盖当前状态）
     */
    setHistory(messages: MessageWire[]): void {
        this._messages = [...messages];
        this._isGenerating = false;
        this._isProcessing = false;
        this._currentAssistantMessage = null;
        this._onStateChange.fire({
            messages: [...this._messages],
            isGenerating: false,
            isProcessing: false,
        });
    }

    /**
     * 清空对话
     */
    clear(): void {
        this._messages = [];
        this._isGenerating = false;
        this._isProcessing = false;
        this._currentAssistantMessage = null;
        this._onStateChange.fire({ messages: [], isGenerating: false, isProcessing: false });
    }

    /**
     * 状态变化事件
     */
    get onStateChange(): Event<{
        messages: MessageWire[];
        isGenerating: boolean;
        isProcessing: boolean;
    }> {
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

export function createRoomState(): RoomState {
    return new RoomStateImpl();
}
