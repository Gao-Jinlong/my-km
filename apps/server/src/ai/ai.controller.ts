/**
 * AiChatController — 薄控制器层
 *
 * 只负责：
 * - DTO 校验
 * - SSE header 设置
 * - 委托给 AiChatService
 *
 * 所有业务逻辑在 Service 中。
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
import { AiChatService } from './ai.service';
import { MessageService } from './message/message.service';
import { ThreadService } from './thread/thread.service';
import type { ConcurrencyPolicy } from './types/run.types';
import type { ThreadStatus } from './types/thread.types';

interface ChatRequestDto {
    content?: string;
    threadId?: string;
    context?: Record<string, unknown>;
    concurrency?: ConcurrencyPolicy;
    llmConfig?: { provider?: string; model?: string };
}

interface ResumeRequestDto {
    toolCallId: string;
    result: unknown;
}

@Controller('ai')
export class AiChatController {
    private readonly logger = new Logger(AiChatController.name);

    constructor(
        private readonly aiService: AiChatService,
        private readonly threadService: ThreadService,
        private readonly messageService: MessageService,
    ) {}

    // ========== SSE Chat Endpoints ==========

    @Post('threads/:threadId/runs')
    async startRun(
        @Param('threadId') threadId: string,
        @Body() dto: ChatRequestDto,
        @Res() res: Response,
    ): Promise<void> {
        this.setSseHeaders(res);

        try {
            const record = await this.aiService.startRun({
                content: dto.content ?? '',
                threadId,
                context: dto.context,
                concurrency: dto.concurrency,
                llmConfig: dto.llmConfig,
            });

            await this.aiService.executeRun(record, res);
        } catch (error) {
            this.sendSseError(res, error);
        }
    }

    @Post('runs/:runId/resume')
    async resumeRun(
        @Param('runId') runId: string,
        @Body() dto: ResumeRequestDto,
        @Res() res: Response,
    ): Promise<void> {
        this.setSseHeaders(res);

        try {
            const record = await this.aiService.resume({
                runId,
                toolCallId: dto.toolCallId,
                result: dto.result,
            });

            await this.aiService.executeRun(record, res);
        } catch (error) {
            this.sendSseError(res, error);
        }
    }

    @Post('runs/:runId/cancel')
    async cancelRun(@Param('runId') runId: string): Promise<{ success: boolean }> {
        await this.aiService.cancel(runId);
        return { success: true };
    }

    // ========== Thread CRUD ==========

    @Get('threads')
    async listThreads(
        @Query('limit') limit?: string,
        @Query('offset') offset?: string,
        @Query('status') status?: ThreadStatus,
    ) {
        return this.threadService.findAll({
            limit: limit ? parseInt(limit, 10) : 50,
            offset: offset ? parseInt(offset, 10) : 0,
            status,
        });
    }

    @Post('threads')
    async createThread(@Body() body: { id?: string; title?: string }) {
        return this.threadService.create(body);
    }

    @Get('threads/:id')
    async getThread(@Param('id') id: string) {
        return this.threadService.findById(id);
    }

    @Get('threads/:id/messages')
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

    @Patch('threads/:id')
    async updateThread(@Param('id') id: string, @Body() body: { title?: string }) {
        return this.threadService.update(id, body);
    }

    @Delete('threads/:id')
    async deleteThread(@Param('id') id: string) {
        await this.threadService.delete(id);
        return { success: true };
    }

    // ========== Private Helpers ==========

    private setSseHeaders(res: Response) {
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('X-Accel-Buffering', 'no');
        res.flushHeaders();
    }

    private sendSseError(res: Response, error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        this.logger.error(`SSE error: ${message}`);
        if (!res.writableEnded) {
            res.write(`event: error\ndata: ${JSON.stringify({ type: 'error', message })}\n\n`);
            res.end();
        }
    }
}
