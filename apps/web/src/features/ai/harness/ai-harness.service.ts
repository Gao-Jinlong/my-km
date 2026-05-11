/**
 * AIHarnessService — AI 能力统一入口
 *
 * 整合上下文收集、WebSocket 连接、工具注册/执行、对话状态管理等所有 AI 能力。
 * 通过 4 个子模块实现，Harness 负责编排和事件代理。
 */

import { Emitter, type Event } from '@/base/common/event';
import type { EditorService } from '@/features/editor/service';
import { ServiceBase } from '@/platform/base/service-base';
import type { AIContextWire, MessageWire, ToolHandler } from '../types/ai.types';
import { type ContextCollector, createContextCollector } from './context-collector';
import { type ConversationState, createConversationState } from './conversation-state';
import { createToolRegistry, type ToolRegistry } from './tool-registry';
import { createWSClient, type WSClient } from './ws-client';

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
    sendMessage(content: string): Promise<void>;
    stopGenerating(): void;

    // 工具相关
    registerTool(name: string, handler: ToolHandler): void;
    unregisterTool(name: string): void;

    // 状态访问
    get messages(): ReadonlyArray<MessageWire>;
    get isGenerating(): boolean;
    get conversationId(): string | null;
    get selectedText(): string | null;

    // 事件
    get onStreamChunk(): Event<{ content: string }>;
    get onToolCall(): Event<{ id: string; name: string; args: object }>;
    get onStreamDone(): Event<void>;
    get onError(): Event<{ message: string; code: string }>;
    get onHistory(): Event<{ messages: MessageWire[] }>;
    get onStateChange(): Event<{ messages: MessageWire[]; isGenerating: boolean }>;
    get onSelectionChange(): Event<{ selectedText: string | null; documentTitle: string }>;
    get onConnectionChange(): Event<{ connected: boolean }>;

    dispose(): void;
}

class AIHarnessServiceImpl extends ServiceBase implements AIHarnessService {
    private _contextCollector: ContextCollector;
    private _wsClient: WSClient;
    private _toolRegistry: ToolRegistry;
    private _conversationState: ConversationState;

    // 事件代理：将子模块事件转发到 Harness
    private _onStreamChunk = new Emitter<{ content: string }>();
    private _onToolCall = new Emitter<{ id: string; name: string; args: object }>();
    private _onStreamDone = new Emitter<void>();
    private _onError = new Emitter<{ message: string; code: string }>();
    private _onHistory = new Emitter<{ messages: MessageWire[] }>();
    private _onStateChange = new Emitter<{ messages: MessageWire[]; isGenerating: boolean }>();
    private _onSelectionChange = new Emitter<{
        selectedText: string | null;
        documentTitle: string;
    }>();
    private _onConnectionChange = new Emitter<{ connected: boolean }>();

    // 当前选中文本
    private _selectedText: string | null = null;
    private _currentDocTitle: string | null = null;

    constructor() {
        super();
        // 创建子模块
        this._contextCollector = createContextCollector();
        this._wsClient = createWSClient();
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

                // 启动 idle timer，超时后自动断开
                this._wsClient.startIdleTimer(() => {
                    this._wsClient.disconnect();
                });
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

    async connect(wsUrl: string): Promise<void> {
        await this._wsClient.connect(wsUrl);
    }

    disconnect(): void {
        this._wsClient.disconnect();
    }

    joinConversation(conversationId: string): void {
        this._conversationState.setConversationId(conversationId);
        this._wsClient.joinConversation(conversationId);
    }

    async sendMessage(content: string): Promise<void> {
        const conversationId = this._conversationState.conversationId;
        if (!conversationId) {
            console.warn('[AI Harness] Cannot send message: no active conversation');
            return;
        }

        // Ensure connected before sending (on-demand connection)
        const wsUrl = process.env.NEXT_PUBLIC_AI_WS_URL ?? 'http://localhost:3001/ai';
        await this._wsClient.ensureConnected(wsUrl);

        // Join conversation (idempotent via socket.io rooms)
        this._wsClient.joinConversation(conversationId);

        // Cancel any pending idle disconnect
        this._wsClient.stopIdleTimer();

        // 乐观更新：先添加用户消息和生成状态，给用户即时反馈
        const userMsgId = `user-${Date.now()}`;
        this._conversationState.addMessage({
            id: userMsgId,
            role: 'user',
            content,
            createdAt: new Date().toISOString(),
        });
        this._conversationState.startGenerating();

        // 异步获取上下文并发送
        this._contextCollector
            .getContext(conversationId.replace('doc-', ''))
            .then(ctx => {
                this._wsClient.sendMessage(content, ctx, conversationId);
            })
            .catch(() => {
                // context 获取失败：回滚乐观状态
                this._conversationState.removeMessage(userMsgId);
                this._conversationState.stopGenerating();
            });
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

    get conversationId(): string | null {
        return this._conversationState.conversationId;
    }

    get selectedText(): string | null {
        return this._selectedText;
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

    get onStateChange(): Event<{ messages: MessageWire[]; isGenerating: boolean }> {
        return this._onStateChange.event;
    }

    get onSelectionChange(): Event<{ selectedText: string | null; documentTitle: string }> {
        return this._onSelectionChange.event;
    }

    get onConnectionChange(): Event<{ connected: boolean }> {
        return this._onConnectionChange.event;
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
        super.dispose();
    }
}

/**
 * 创建 AIHarnessService 实例
 */
export function createAIHarnessService(): AIHarnessService {
    return new AIHarnessServiceImpl();
}
