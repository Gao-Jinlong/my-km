/**
 * AIHarnessService — AI 能力统一入口
 *
 * 整合上下文收集、WebSocket 连接、工具注册/执行、对话状态管理等所有 AI 能力。
 * 通过 4 个子模块实现，Harness 负责编排和事件代理。
 */

import { Emitter, type Event } from '@/base/common/event';
import type { EditorService } from '@/features/editor/service';
import { ServiceBase } from '@/platform/base/service-base';
import { Inject } from '@/platform/di';
import { WSClientService } from '@/platform/ws-client';
import type { AIContextWire, MessageWire, ToolHandler } from '../types/ai.types';
import { type ContextCollector, createContextCollector } from './context-collector';
import { type ConversationState, createConversationState } from './conversation-state';
import { createToolRegistry, type ToolRegistry } from './tool-registry';

/**
 * AIHarnessService 接口
 */
export interface AIHarnessService {
    // 上下文相关
    getContext(documentId: string): Promise<AIContextWire | null>;
    registerEditor(documentId: string, editorService: EditorService): void;
    unregisterEditor(documentId: string): void;
    setDocumentMeta(documentId: string, meta: { id: string; title: string; path: string }): void;

    // 对话相关
    connect(wsUrl: string): Promise<void>;
    disconnect(): void;
    joinConversation(conversationId: string): void;
    sendMessage(content: string, conversationId?: string): Promise<string | null>; // Returns conversationId
    sendCreateAndSend(content: string): Promise<string | null>; // For new conversations
    restoreConversation(conversationId: string): void; // Conversation recovery
    stopGenerating(): void;

    // 工具相关
    registerTool(name: string, handler: ToolHandler): void;
    unregisterTool(name: string): void;

    // 状态访问
    get messages(): ReadonlyArray<MessageWire>;
    get isGenerating(): boolean;
    get isProcessing(): boolean;
    get conversationId(): string | null;
    get selectedText(): string | null;
    get wsClient(): WSClientService;

    // 事件
    get onStreamChunk(): Event<{ content: string }>;
    get onToolCall(): Event<{ id: string; name: string; args: object }>;
    get onStreamDone(): Event<void>;
    get onError(): Event<{ message: string; code: string }>;
    get onHistory(): Event<{ messages: MessageWire[] }>;
    get onStateChange(): Event<{
        messages: MessageWire[];
        isGenerating: boolean;
        isProcessing: boolean;
    }>;
    get onSelectionChange(): Event<{ selectedText: string | null; documentTitle: string }>;
    get onConnectionChange(): Event<{ connected: boolean }>;
    get onStatus(): Event<{ conversationId: string; status: string; message?: string }>;
    get onCreated(): Event<{ conversationId: string }>;
    get onDone(): Event<{ conversationId: string; finishReason: string; error?: string }>;

    dispose(): void;
}

class AIHarnessServiceImpl extends ServiceBase implements AIHarnessService {
    private _contextCollector: ContextCollector;
    private _wsClient: WSClientService;
    private _toolRegistry: ToolRegistry;
    private _conversationState: ConversationState;

    // 事件代理：将子模块事件转发到 Harness
    private _onStreamChunk = new Emitter<{ content: string }>();
    private _onToolCall = new Emitter<{ id: string; name: string; args: object }>();
    private _onStreamDone = new Emitter<void>();
    private _onError = new Emitter<{ message: string; code: string }>();
    private _onHistory = new Emitter<{ messages: MessageWire[] }>();
    private _onStateChange = new Emitter<{
        messages: MessageWire[];
        isGenerating: boolean;
        isProcessing: boolean;
    }>();
    private _onSelectionChange = new Emitter<{
        selectedText: string | null;
        documentTitle: string;
    }>();
    private _onConnectionChange = new Emitter<{ connected: boolean }>();
    private _onStatus = new Emitter<{ conversationId: string; status: string; message?: string }>();
    private _onCreated = new Emitter<{ conversationId: string }>();
    private _onDone = new Emitter<{
        conversationId: string;
        finishReason: string;
        error?: string;
    }>();

    // 当前选中文本
    private _selectedText: string | null = null;
    private _currentDocTitle: string | null = null;

    constructor(@Inject(WSClientService) wsClient: WSClientService) {
        super();
        // 创建子模块
        this._contextCollector = createContextCollector();
        this._wsClient = wsClient;
        this._toolRegistry = createToolRegistry();
        this._conversationState = createConversationState();

        // 设置事件代理
        this._setupEventProxy();
        this._setupToolCallHandler();
    }

    /**
     * 将子模块事件代理到 Harness
     */
    private _setupEventProxy(): void {
        this._store.add(
            this._wsClient.onStreamChunk(e => {
                this._conversationState.appendStreamChunk(e.content);
                this._onStreamChunk.fire(e);
            }),
        );
        this._store.add(this._wsClient.onToolCall(e => this._onToolCall.fire(e)));
        this._store.add(
            this._wsClient.onStreamDone(() => {
                this._conversationState.stopGenerating();
                this._onStreamDone.fire();
            }),
        );
        this._store.add(this._wsClient.onError(e => this._onError.fire(e)));
        this._store.add(
            this._wsClient.onHistory(e => {
                this._onHistory.fire(e as { messages: MessageWire[] });
                // 自动加载到对话状态
                this._conversationState.setHistory((e as { messages: MessageWire[] }).messages);
            }),
        );
        this._store.add(
            this._wsClient.onToolTimeout(e =>
                this._onError.fire({
                    message: `Tool timeout: ${e.toolCallId}`,
                    code: 'TOOL_TIMEOUT',
                }),
            ),
        );
        this._store.add(this._conversationState.onStateChange(e => this._onStateChange.fire(e)));

        // 监听编辑器选中文本变化
        this._store.add(
            this._contextCollector.onContextChange(e => {
                this._selectedText = e.context.selectedText;
                this._currentDocTitle = e.context.documentTitle;
                this._onSelectionChange.fire({
                    selectedText: this._selectedText,
                    documentTitle: this._currentDocTitle ?? '',
                });
            }),
        );

        // 监听连接状态变化
        this._store.add(this._wsClient.onConnectionChange(e => this._onConnectionChange.fire(e)));

        // NEW: Handle created event
        this._store.add(
            this._wsClient.onCreated(e => {
                this._conversationState.setConversationId(e.conversationId);
                this._saveActiveConversationId(e.conversationId);
                this._onCreated.fire(e);
            }),
        );
        // NEW: Handle status event
        this._store.add(
            this._wsClient.onStatus(e => {
                this._onStatus.fire(e);
            }),
        );
        // NEW: Handle done event
        this._store.add(
            this._wsClient.onDone(e => {
                this._conversationState.stopGenerating();
                this._clearActiveConversationId();
                this._onDone.fire(e);
            }),
        );
    }

    /**
     * 处理 tool call 事件：执行工具并返回结果
     */
    private _setupToolCallHandler(): void {
        this._store.add(
            this._wsClient.onToolCall(async ({ id, name, args }) => {
                try {
                    const result = await this._toolRegistry.execute(name, args as object);
                    const conversationId = this._conversationState.conversationId;
                    if (conversationId) {
                        this._wsClient.stopIdleTimer();
                        this._wsClient.sendToolResult(conversationId, id, result);
                    }
                } catch (error) {
                    const conversationId = this._conversationState.conversationId;
                    if (conversationId) {
                        this._wsClient.stopIdleTimer();
                        this._wsClient.sendToolResult(
                            conversationId,
                            id,
                            null,
                            (error as Error).message,
                        );
                    }
                }
            }),
        );
    }

    // ========== 上下文相关 ==========

    async getContext(documentId: string): Promise<AIContextWire | null> {
        return this._contextCollector.getContext(documentId);
    }

    registerEditor(documentId: string, editorService: EditorService): void {
        this._contextCollector.registerEditor(documentId, editorService);
    }

    unregisterEditor(documentId: string): void {
        this._contextCollector.unregisterEditor(documentId);
    }

    setDocumentMeta(documentId: string, meta: { id: string; title: string; path: string }): void {
        this._contextCollector.setDocumentMeta(documentId, meta);
    }

    // ========== 对话相关 ==========

    async connect(_wsUrl: string): Promise<void> {
        // URL 已由 WSClientService 内部管理，此处确保连接即可
        await this._wsClient.ensureConnected();
    }

    disconnect(): void {
        this._wsClient.release();
    }

    joinConversation(conversationId: string): void {
        this._conversationState.setConversationId(conversationId);
        this._wsClient.joinConversation(conversationId);
    }

    async sendMessage(content: string, conversationId?: string): Promise<string | null> {
        const targetConv = conversationId ?? this._conversationState.conversationId;
        if (targetConv) {
            return this._sendExistingConversation(targetConv, content);
        }
        return this.sendCreateAndSend(content);
    }

    private async _sendExistingConversation(
        conversationId: string,
        content: string,
    ): Promise<string | null> {
        if (this._conversationState.isProcessing) {
            console.warn('[AI Harness] Cannot send: conversation is processing');
            return null;
        }

        await this._wsClient.ensureConnected();
        this._wsClient.stopIdleTimer();

        const userMsgId = `user-${Date.now()}`;
        this._conversationState.addMessage({
            id: userMsgId,
            role: 'user',
            content,
            createdAt: new Date().toISOString(),
        });
        this._conversationState.startGenerating();

        this._saveActiveConversationId(conversationId);

        const ctx = await this._contextCollector.getContext(conversationId.replace('doc-', ''));
        this._wsClient.sendMessage(content, ctx, conversationId);

        return conversationId;
    }

    async sendCreateAndSend(content: string): Promise<string | null> {
        if (this._conversationState.isProcessing) {
            console.warn('[AI Harness] Cannot send: conversation is processing');
            return null;
        }

        await this._wsClient.ensureConnected();
        this._wsClient.stopIdleTimer();

        const userMsgId = `user-${Date.now()}`;
        this._conversationState.addMessage({
            id: userMsgId,
            role: 'user',
            content,
            createdAt: new Date().toISOString(),
        });
        this._conversationState.startGenerating();

        const ctx = await this._contextCollector.getContext('');
        this._wsClient.sendCreateAndSend(content, ctx);

        // conversationId will be set when 'created' event arrives
        return null;
    }

    restoreConversation(conversationId: string): void {
        this._conversationState.setConversationId(conversationId);
        this._wsClient.sendJoin(conversationId);
        // History will arrive via 'history' event and be loaded by _setupEventProxy
    }

    private _saveActiveConversationId(id: string): void {
        try {
            localStorage.setItem('activeConversationId', id);
        } catch {
            // localStorage may be unavailable
        }
    }

    private _clearActiveConversationId(): void {
        try {
            localStorage.removeItem('activeConversationId');
        } catch {
            // localStorage may be unavailable
        }
    }

    stopGenerating(): void {
        const conversationId = this._conversationState.conversationId;
        if (conversationId) {
            this._wsClient.stopGenerating(conversationId);
        }
        this._conversationState.stopGenerating();
    }

    // ========== 工具相关 ==========

    registerTool(name: string, handler: ToolHandler): void {
        this._toolRegistry.register(name, handler);
    }

    unregisterTool(name: string): void {
        this._toolRegistry.unregister(name);
    }

    // ========== 状态访问 ==========

    get messages(): ReadonlyArray<MessageWire> {
        return this._conversationState.messages;
    }

    get isGenerating(): boolean {
        return this._conversationState.isGenerating;
    }

    get isProcessing(): boolean {
        return this._conversationState.isProcessing;
    }

    get conversationId(): string | null {
        return this._conversationState.conversationId;
    }

    get selectedText(): string | null {
        return this._selectedText;
    }

    get wsClient(): WSClientService {
        return this._wsClient;
    }

    // ========== 事件 ==========

    get onStreamChunk(): Event<{ content: string }> {
        return this._onStreamChunk.event;
    }

    get onToolCall(): Event<{ id: string; name: string; args: object }> {
        return this._onToolCall.event;
    }

    get onStreamDone(): Event<void> {
        return this._onStreamDone.event;
    }

    get onError(): Event<{ message: string; code: string }> {
        return this._onError.event;
    }

    get onHistory(): Event<{ messages: MessageWire[] }> {
        return this._onHistory.event;
    }

    get onStateChange(): Event<{
        messages: MessageWire[];
        isGenerating: boolean;
        isProcessing: boolean;
    }> {
        return this._onStateChange.event;
    }

    get onSelectionChange(): Event<{ selectedText: string | null; documentTitle: string }> {
        return this._onSelectionChange.event;
    }

    get onConnectionChange(): Event<{ connected: boolean }> {
        return this._onConnectionChange.event;
    }

    get onStatus(): Event<{ conversationId: string; status: string; message?: string }> {
        return this._onStatus.event;
    }

    get onCreated(): Event<{ conversationId: string }> {
        return this._onCreated.event;
    }

    get onDone(): Event<{ conversationId: string; finishReason: string; error?: string }> {
        return this._onDone.event;
    }

    override dispose(): void {
        this._contextCollector.dispose();
        this._wsClient.dispose();
        this._toolRegistry.dispose();
        this._conversationState.dispose();
        this._onStreamChunk.dispose();
        this._onToolCall.dispose();
        this._onStreamDone.dispose();
        this._onError.dispose();
        this._onHistory.dispose();
        this._onStateChange.dispose();
        this._onSelectionChange.dispose();
        this._onConnectionChange.dispose();
        this._onStatus.dispose();
        this._onCreated.dispose();
        this._onDone.dispose();
        super.dispose();
    }
}

/**
 * 创建 AIHarnessService 实例
 */
export function createAIHarnessService(wsClient: WSClientService): AIHarnessService {
    return new AIHarnessServiceImpl(wsClient);
}
