/**
 * RunsController — Run 全生命周期控制器（合并版）
 *
 * LangGraph Platform 协议兼容端点：
 *   GET    /api/threads/:threadId/runs                → listRuns
 *   GET    /api/threads/:threadId/runs/:runId         → getRun
 *   POST   /api/threads/:threadId/runs/stream         → streamRun（SSE）
 *   POST   /api/threads/:threadId/runs/:runId/cancel  → cancelRun（唯一注册点）
 *   GET    /api/threads/:threadId/runs/:runId/stream  → joinStream（SSE 重连）
 *
 * 关键设计：
 * - Controller 是纯路由：streamRun/joinStream 直接转发到 AiChatService 对应门面方法，
 *   SSE 胶水（建 sink、设 header、写错误帧、断线清理）内聚在 service。
 * - cancel 路由只在此处注册一次（消除旧 threads.controller 与本 controller 的路由冲突）。
 * - Run 查询通过 RunQueryService，不直接持有 PrismaService。
 * - joinStream 仅 catch NotFoundException：spec 3.5 要求 404 在 SSE flush 前以 JSON 返回。
 */

import {
    Body,
    Controller,
    Get,
    Inject,
    Logger,
    NotFoundException,
    Param,
    Post,
    Query,
    Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { SkipResponseWrap } from '../../common/decorators/skip-response-wrap.decorator';
import { AiChatService } from '../ai.service';
import type { RunsStreamBody } from './langgraph-run.dto';
import { REPLICA_ID } from './replica-id';
import { toRunDto } from './run-dto.mapper';
import { RunQueryService } from './run-query.service';

@Controller('threads')
@SkipResponseWrap()
export class RunsController {
    private readonly logger = new Logger(RunsController.name);

    constructor(
        private readonly aiService: AiChatService,
        private readonly runQueryService: RunQueryService,
        @Inject(REPLICA_ID) private readonly replicaId: string,
    ) {}

    /** GET /api/threads/:threadId/runs — 列出 Thread 的所有 Run */
    @Get(':threadId/runs')
    async listRuns(@Param('threadId') threadId: string) {
        const runs = await this.runQueryService.listByThread(threadId);
        return runs.map(toRunDto);
    }

    /** GET /api/threads/:threadId/runs/:runId — 获取单个 Run 详情 */
    @Get(':threadId/runs/:runId')
    async getRun(
        @Param('threadId') _threadId: string,
        @Param('runId') runId: string,
    ) {
        const run = await this.runQueryService.findById(runId);
        if (!run) {
            throw new NotFoundException(`Run not found: ${runId}`);
        }
        return toRunDto(run);
    }

    /**
     * POST /api/threads/:threadId/runs/stream — 启动或恢复 streaming run
     *
     * 纯转发：所有 SSE 胶水和编排逻辑在 aiService.streamRun。
     * service 内部处理 resume 判断、user message 提取、错误帧映射。
     */
    @Post(':threadId/runs/stream')
    async streamRun(
        @Param('threadId') threadId: string,
        @Body() body: RunsStreamBody,
        @Res() res: Response,
    ): Promise<void> {
        await this.aiService.streamRun(
            {
                threadId,
                input: body.input,
                command: body.command,
                context: body.context,
                multitaskStrategy: body.multitask_strategy,
            },
            res,
        );
    }

    /**
     * POST /api/threads/:threadId/runs/:runId/cancel — 取消活跃 run（跨副本支持）
     *
     * - 本副本 owner → 204 No Content
     * - 非 owner，已转发 signal 给 owner → 202 Accepted
     */
    @Post(':threadId/runs/:runId/cancel')
    async cancelRun(
        @Param('threadId') _threadId: string,
        @Param('runId') runId: string,
        @Res() res: Response,
    ): Promise<void> {
        const result = await this.aiService.cancel(runId);
        if (result.ownerId === this.replicaId) {
            res.status(204).end();
        } else {
            res.status(202).json({ accepted: true, ownerId: result.ownerId });
        }
    }

    /**
     * GET /api/threads/:threadId/runs/:runId/stream — 重新加入正在进行的 run（spec 3.5）
     *
     * 仅 catch NotFoundException：lookupRun 的 404 必须在 SSE flush 前以 JSON 返回
     * （service 内 lookupRun 失败时 res 尚未 flush，抛出由这里转 404 JSON）。
     * service 校验通过后自行设 SSE 头、写错误帧、注册断线清理。
     */
    @Get(':threadId/runs/:runId/stream')
    async joinStream(
        @Param('threadId') _threadId: string,
        @Param('runId') runId: string,
        @Query('since') sinceParam: string | undefined,
        @Res() res: Response,
    ): Promise<void> {
        const parsed = Number.parseInt(sinceParam ?? '0', 10);
        const since = Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;

        try {
            await this.aiService.joinStream(runId, since, res);
        } catch (error) {
            if (!res.writableEnded && error instanceof NotFoundException) {
                res.status(404).json({ error: 'not_found', message: (error as Error).message });
                return;
            }
            // res 已 ended（service 写了错误帧）或其他错误：service 已处理，不重复
        }
    }
}
