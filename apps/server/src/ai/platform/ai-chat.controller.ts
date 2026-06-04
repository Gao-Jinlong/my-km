/**
 * AiChatController — AI SSE 端点
 *
 * 替代旧的 Socket.io WebSocket 通信层。
 * 使用 HTTP POST + SSE 流式协议，直接执行 LangGraph 图。
 *
 * 端点:
 *   POST /ai/chat          — 发送消息，返回 SSE 流
 *   POST /ai/chat/resume    — 恢复中断的工具调用
 *   POST /ai/chat/cancel    — 取消生成
 *   GET  /ai/rooms          — 对话列表 (不变)
 *   POST /ai/rooms          — 创建对话 (不变)
 *   GET  /ai/rooms/:id/messages — 消息历史 (不变)
 *   PATCH /ai/rooms/:id     — 更新对话 (不变)
 *   DELETE /ai/rooms/:id    — 删除对话 (不变)
 */

import {
    Body,
    Controller,
    Delete,
    Get,
    Logger,
    Param,
    Patch,
    Post,
    Query,
    Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { RoomService } from '../conversation/room.service';
import type { RoomStatus } from '../conversation/room.types';
import { LLMFactory } from '../llm/llm-factory';
import { ProviderRegistry } from '../llm/provider-registry';
import { MessageService } from '../message/message.service';
import { MessageStoreImpl } from '../message/message-store.impl';
import { SSEExecutor } from './sse-executor';
import { frontendToolDefinitions } from './tool-definitions';

interface ChatRequestDto {
    /** 消息内容 */
    content?: string;
    /** 房间 ID (已有对话时传入) */
    roomId?: string;
    /** 编辑器上下文 */
    context?: {
        documentId?: string;
        documentTitle?: string;
        documentPath?: string;
        selectedText?: string | null;
        fullContent?: string | null;
        cursorPosition?: unknown;
        formatState?: unknown;
    };
    /** LLM 配置 */
    llmConfig?: {
        provider?: string;
        model?: string;
    };
}

interface ResumeRequestDto {
    /** 房间/线程 ID */
    roomId: string;
    /** 工具调用 ID */
    toolCallId: string;
    /** 工具执行结果 */
    result: unknown;
}

@Controller('ai')
export class AiChatController {
    private readonly logger = new Logger(AiChatController.name);

    constructor(
        private readonly roomService: RoomService,
        private readonly messageService: MessageService,
        private readonly providerRegistry: ProviderRegistry,
        private readonly llmFactory: LLMFactory,
        private readonly messageStore: MessageStoreImpl,
    ) {}

    /**
     * POST /ai/chat — 发送消息并返回 SSE 流
     *
     * 接收用户消息，通过 SSEExecutor 执行 LangGraph 图，
     * 将流式结果以 SSE 事件格式返回前端。
     */
    @Post('chat')
    async handleChat(@Body() dto: ChatRequestDto, @Res() res: Response): Promise<void> {
        // 设置 SSE headers
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('X-Accel-Buffering', 'no');
        res.flushHeaders();

        // 创建 SSEExecutor 实例
        const defaultConfig = this.providerRegistry.defaultConfig;
        if (!defaultConfig) {
            res.write(
                `event: error\ndata: ${JSON.stringify({ type: 'error', message: 'No LLM provider configured' })}\n\n`,
            );
            res.end();
            return;
        }

        const llmProvider = this.llmFactory.getOrCreate(defaultConfig);
        const executor = new SSEExecutor(
            llmProvider,
            this.roomService,
            this.messageStore,
            frontendToolDefinitions,
        );

        // 执行图
        await executor.execute({
            res,
            content: dto.content ?? '',
            roomId: dto.roomId,
            context: dto.context as Record<string, unknown>,
        });
    }

    /**
     * POST /ai/chat/resume — 恢复中断的工具调用
     */
    @Post('chat/resume')
    async resumeChat(@Body() dto: ResumeRequestDto, @Res() res: Response): Promise<void> {
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('X-Accel-Buffering', 'no');
        res.flushHeaders();

        const defaultConfig = this.providerRegistry.defaultConfig;
        if (!defaultConfig) {
            res.write(
                `event: error\ndata: ${JSON.stringify({ type: 'error', message: 'No LLM provider configured' })}\n\n`,
            );
            res.end();
            return;
        }

        const llmProvider = this.llmFactory.getOrCreate(defaultConfig);
        const executor = new SSEExecutor(
            llmProvider,
            this.roomService,
            this.messageStore,
            frontendToolDefinitions,
        );

        await executor.resume({
            res,
            roomId: dto.roomId,
            toolCallId: dto.toolCallId,
            result: dto.result,
        });
    }

    /**
     * POST /ai/chat/cancel — 取消生成
     */
    @Post('chat/cancel')
    async cancelChat(@Body() dto: { roomId: string }): Promise<{ success: boolean }> {
        // TODO: Phase 4 — 实现 AbortController 取消图执行
        this.logger.log(`Cancel requested for room: ${dto.roomId}`);
        return { success: true };
    }

    // ========== Room CRUD (保留原有 REST API) ==========

    @Get('rooms')
    async listRooms(
        @Query('limit') limit?: string,
        @Query('offset') offset?: string,
        @Query('status') status?: RoomStatus,
    ) {
        return this.roomService.findAll({
            limit: limit ? parseInt(limit, 10) : 50,
            offset: offset ? parseInt(offset, 10) : 0,
            status,
        });
    }

    @Post('rooms')
    async createRoom(@Body() body: { id?: string; title?: string }) {
        return this.roomService.create(body);
    }

    @Get('rooms/:id/messages')
    async getMessages(
        @Param('id') id: string,
        @Query('limit') limit?: string,
        @Query('offset') offset?: string,
    ) {
        return this.messageService.findByRoomId(id, {
            limit: limit ? parseInt(limit, 10) : 100,
            offset: offset ? parseInt(offset, 10) : 0,
        });
    }

    @Patch('rooms/:id')
    async updateRoom(@Param('id') id: string, @Body() body: { title?: string }) {
        return this.roomService.updateMetadata(id, body);
    }

    @Delete('rooms/:id')
    async deleteRoom(@Param('id') id: string) {
        await this.roomService.delete(id);
        return { success: true };
    }
}
