/**
 * RunsController — Run 查询和取消 API
 *
 * LangGraph Platform 协议兼容端点：
 *   GET    /api/threads/:threadId/runs           → listRuns
 *   GET    /api/threads/:threadId/runs/:runId    → getRun
 *   POST   /api/threads/:threadId/runs/:runId/cancel → cancelRun
 *
 * Run 的创建和执行在 ThreadsController.streamRun 中处理，
 * 此控制器只负责查询历史 Run 和取消活跃 Run。
 */

import { Controller, Get, Logger, NotFoundException, Param, Post } from '@nestjs/common';
import { SkipResponseWrap } from '../../common/decorators/skip-response-wrap.decorator';
import { PrismaService } from '../../prisma/prisma.service';
import { AiChatService } from '../ai.service';
import type { RunDto } from '../types/run.types';

@Controller('threads')
@SkipResponseWrap()
export class RunsController {
    private readonly logger = new Logger(RunsController.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly aiService: AiChatService,
    ) {}

    /**
     * GET /api/threads/:threadId/runs — 列出 Thread 的所有 Run
     */
    @Get(':threadId/runs')
    async listRuns(@Param('threadId') threadId: string): Promise<RunDto[]> {
        const runs = await this.prisma.run.findMany({
            where: { threadId },
            orderBy: { createdAt: 'desc' },
            take: 50,
        });

        return runs.map(this.toRunDto);
    }

    /**
     * GET /api/threads/:threadId/runs/:runId — 获取单个 Run 详情
     */
    @Get(':threadId/runs/:runId')
    async getRun(
        @Param('threadId') _threadId: string,
        @Param('runId') runId: string,
    ): Promise<RunDto> {
        const run = await this.prisma.run.findUnique({
            where: { id: runId },
        });

        if (!run) {
            throw new NotFoundException(`Run not found: ${runId}`);
        }

        return this.toRunDto(run);
    }

    /**
     * POST /api/threads/:threadId/runs/:runId/cancel — 取消活跃 Run
     */
    @Post(':threadId/runs/:runId/cancel')
    async cancelRun(
        @Param('threadId') _threadId: string,
        @Param('runId') runId: string,
    ): Promise<void> {
        await this.aiService.cancel(runId);
    }

    /**
     * 将 Prisma Run 模型转换为 RunDto
     */
    private toRunDto(run: Awaited<ReturnType<PrismaService['run']['findUnique']>> & {}): RunDto {
        return {
            id: run.id,
            threadId: run.threadId,
            status: run.status as RunDto['status'],
            model: run.model ?? undefined,
            provider: run.provider ?? undefined,
            promptTokens: run.promptTokens,
            completionTokens: run.completionTokens,
            totalTokens: run.totalTokens,
            startedAt: run.startedAt?.toISOString(),
            completedAt: run.completedAt?.toISOString(),
            createdAt: run.createdAt.toISOString(),
        };
    }
}
