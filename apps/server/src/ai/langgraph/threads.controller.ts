/**
 * ThreadsController — LangGraph Platform 协议兼容控制器
 *
 * 实现 @langchain/langgraph-sdk Client 期望的 REST API 接口：
 *   POST   /api/threads                              → createThread
 *   POST   /api/threads/search                       → searchThreads
 *   GET    /api/threads/:id                          → getThread
 *   PATCH  /api/threads/:id                          → updateThread
 *   DELETE /api/threads/:id                          → deleteThread
 *   GET    /api/threads/:id/state                    → getThreadState
 *   POST   /api/threads/:tid/runs/stream             → streamRun (SSE)
 *   POST   /api/threads/:tid/runs/:rid/cancel        → cancelRun
 *   GET    /api/threads/:tid/runs/:rid/stream        → joinStream (SSE 重连)
 *
 * 关键设计：
 * - `@Controller('threads')` + 全局前缀 `/api` → 路由为 `/api/threads/...`
 * - `@SkipResponseWrap()` 跳过 TransformInterceptor，返回 SDK 期望的裸 JSON
 * - SSE 端点用 `@Res() res: Response` 直接写入流
 * - `streamRun` 同时处理新 run 和 resume（通过 body.command.resume 区分）
 * - multitask_strategy 直接透传给 AiChatService，不再做枚举映射
 */

import {
    Body,
    Controller,
    Delete,
    Get,
    Logger,
    NotFoundException,
    Param,
    Patch,
    Post,
    Query,
    Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { SkipResponseWrap } from '../../common/decorators/skip-response-wrap.decorator';
import { AiChatService } from '../ai.service';
import { CheckpointReaderService } from '../checkpointer/checkpoint-reader.service';
import type { RunStreamEvent } from '../event/event-bus';
import { writeSSE } from '../langgraph/langgraph-protocol';
import { JoinStreamService } from '../run/join-stream.service';
import type { RunEventSink } from '../run/run-event-sink';
import { RunRecord } from '../run/run-record';
import { ThreadService } from '../thread/thread.service';
import type { MultitaskStrategy } from '../types/run.types';

// ========== LangGraph SDK 请求/响应类型 ==========

/**
 * LangGraph SDK threads.create() 请求体
 *
 * SDK 发送：{ metadata?, thread_id?, if_exists? }
 */
interface CreateThreadBody {
    metadata?: Record<string, unknown>;
    thread_id?: string;
    if_exists?: 'raise' | 'do_nothing';
}

/**
 * LangGraph SDK threads.search() 请求体
 *
 * SDK 发送：{ metadata?, limit?, offset?, status?, ... }
 */
interface SearchThreadsBody {
    metadata?: Record<string, unknown>;
    limit?: number;
    offset?: number;
    status?: 'idle' | 'busy' | 'interrupted' | 'error';
}

/**
 * LangGraph SDK threads.update() 请求体
 */
interface UpdateThreadBody {
    metadata?: Record<string, unknown>;
}

/**
 * LangGraph SDK runs.stream() 请求体
 *
 * SDK 发送：
 *   新 run: { input: {messages: [...]}, assistant_id, stream_mode, config?, context? }
 *   resume: { input: null, command: { resume: {...} }, assistant_id, stream_mode }
 */
interface RunsStreamBody {
    input?: { messages?: Array<{ type: string; content: string; id?: string }> } | null;
    command?: { resume?: unknown } | null;
    assistant_id?: string;
    stream_mode?: string | string[];
    config?: { configurable?: Record<string, unknown> };
    context?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
    multitask_strategy?: MultitaskStrategy;
}

/**
 * LangGraph SDK 期望的 Thread 响应格式
 *
 * 区别于内部 ThreadDto：使用 thread_id / metadata / values 字段名。
 */
interface LangGraphThread {
    thread_id: string;
    metadata: Record<string, unknown>;
    created_at: string;
    updated_at: string;
    status: 'idle' | 'busy' | 'interrupted' | 'error';
    values: Record<string, unknown>;
}

@Controller('threads')
@SkipResponseWrap()
export class ThreadsController {
    private readonly logger = new Logger(ThreadsController.name);

    constructor(
        private readonly aiService: AiChatService,
        private readonly threadService: ThreadService,
        private readonly checkpointReader: CheckpointReaderService,
        private readonly joinStreamService: JoinStreamService,
    ) {}

    // ========== Thread CRUD ==========

    /**
     * POST /api/threads — 创建 Thread
     *
     * 接受 LangGraph SDK 格式：{ metadata, thread_id, if_exists }
     * 转换为内部 ThreadService.create() 格式。
     */
    @Post()
    async createThread(@Body() body: CreateThreadBody): Promise<LangGraphThread> {
        const title = typeof body.metadata?.title === 'string' ? body.metadata.title : undefined;
        const thread = await this.threadService.create({
            id: body.thread_id,
            title,
        });

        return this.toLangGraphThread(thread);
    }

    /**
     * POST /api/threads/search — 搜索/列出 Threads
     *
     * SDK 期望 POST + body（区别于内部 GET 风格的列表）。
     */
    @Post('search')
    async searchThreads(@Body() body: SearchThreadsBody): Promise<LangGraphThread[]> {
        const threads = await this.threadService.findAll({
            limit: body.limit ?? 10,
            offset: body.offset ?? 0,
        });

        return threads.map(t => this.toLangGraphThread(t));
    }

    /**
     * GET /api/threads/:threadId — 获取单个 Thread
     */
    @Get(':threadId')
    async getThread(@Param('threadId') threadId: string): Promise<LangGraphThread> {
        const thread = await this.threadService.findById(threadId);
        if (!thread) {
            throw new NotFoundException(`Thread not found: ${threadId}`);
        }
        return this.toLangGraphThread(thread);
    }

    /**
     * PATCH /api/threads/:threadId — 更新 Thread metadata
     */
    @Patch(':threadId')
    async updateThread(
        @Param('threadId') threadId: string,
        @Body() body: UpdateThreadBody,
    ): Promise<LangGraphThread> {
        const title = typeof body.metadata?.title === 'string' ? body.metadata.title : undefined;
        const updated = await this.threadService.update(threadId, { title });
        return this.toLangGraphThread(updated);
    }

    /**
     * DELETE /api/threads/:threadId — 软删除 Thread
     */
    @Delete(':threadId')
    async deleteThread(@Param('threadId') threadId: string): Promise<void> {
        await this.threadService.delete(threadId);
    }

    /**
     * GET /api/threads/:threadId/state — 获取 Thread 当前状态
     *
     * 返回 LangGraph ThreadState 格式：{ values: { messages: [...] }, ... }
     *
     * 从 LangGraph PostgresSaver checkpoint 中提取消息。
     */
    @Get(':threadId/state')
    async getThreadState(@Param('threadId') threadId: string) {
        return this.checkpointReader.getThreadState(threadId);
    }

    // ========== Run Streaming ==========

    /**
     * POST /api/threads/:threadId/runs/stream — 启动或恢复 streaming run
     *
     * 处理两种请求：
     * - 新 run: body.input.messages 包含 user message
     * - resume: body.command.resume 包含工具结果
     *
     * SSE 事件流：metadata → values → end（或 error）
     */
    @Post(':threadId/runs/stream')
    async streamRun(
        @Param('threadId') threadId: string,
        @Body() body: RunsStreamBody,
        @Res() res: Response,
    ): Promise<void> {
        this.setSseHeaders(res);

        try {
            let record: RunRecord;
            if (body.command?.resume !== undefined) {
                // Resume 路径：从活跃 run 中恢复
                record = await this.aiService.resumeFromCommand(threadId, body.command);
            } else {
                // 新 run 路径：从 input.messages 中提取用户消息
                const content = this.extractLastUserMessage(body.input?.messages ?? []);
                if (!content) {
                    this.sendProtocolError(res, 'invalid_input', 'No user message in input');
                    return;
                }

                record = await this.aiService.startRun({
                    content,
                    threadId,
                    context: body.context,
                    // multitask_strategy 直接透传，AiChatService 内统一处理
                    multitaskStrategy: body.multitask_strategy ?? 'reject',
                });
            }

            // 桥接 writeSSE → record.emitEvent，使 SSE 事件同时写入 EventStore；透传 seq 写 id: 行
            record.setSseWriter(sseEvent => {
                writeSSE(res, sseEvent.event, sseEvent.data, sseEvent.seq);
            });

            await this.aiService.executeRunProtocol(record);
        } catch (error) {
            this.logger.error(`streamRun failed: ${(error as Error).message}`);
            this.sendProtocolError(
                res,
                'execution_error',
                error instanceof Error ? error.message : 'Unknown error',
            );
        } finally {
            if (!res.writableEnded) {
                res.end();
            }
        }
    }

    /**
     * POST /api/threads/:threadId/runs/:runId/cancel — 取消活跃 run
     */
    @Post(':threadId/runs/:runId/cancel')
    async cancelRun(
        @Param('threadId') _threadId: string,
        @Param('runId') runId: string,
    ): Promise<void> {
        await this.aiService.cancel(runId);
    }

    /**
     * GET /api/threads/:threadId/runs/:runId/stream — 重新加入正在进行的 run（spec 3.5）
     *
     * 回放 PG 持久化事件（seq > since）+ 续收 EventBus 实时事件，按 seq 去重衔接，
     * 终态（end/error）关闭 SSE。since=0 从头回放。
     */
    @Get(':threadId/runs/:runId/stream')
    async joinStream(
        @Param('threadId') _threadId: string,
        @Param('runId') runId: string,
        @Query('since') sinceParam: string | undefined,
        @Res() res: Response,
    ): Promise<void> {
        const since = Number.parseInt(sinceParam ?? '0', 10);
        const safeSince = Number.isFinite(since) && since >= 0 ? since : 0;

        // 先校验 run 存在：404 必须在 SSE headers flush 前（spec 3.5 Step 1）
        try {
            await this.joinStreamService.lookupRun(runId);
        } catch (error) {
            if (!res.writableEnded) {
                if (error instanceof NotFoundException) {
                    res.status(404).json({ error: 'not_found', message: (error as Error).message });
                } else {
                    this.logger.error(`joinStream lookup failed: ${(error as Error).message}`);
                    res.status(500).json({
                        error: 'execution_error',
                        message: (error as Error).message,
                    });
                }
            }
            return;
        }

        this.setSseHeaders(res);

        const sink: RunEventSink = {
            push: (event: RunStreamEvent) => {
                writeSSE(res, event.eventType, event.payload, event.seq);
            },
            close: () => {
                if (!res.writableEnded) {
                    res.end();
                }
            },
        };

        let cleanup: () => void = () => {};
        // 客户端断开时清理（防 interrupted 连接 subscription 泄漏）
        res.on('close', () => cleanup());

        try {
            cleanup = await this.joinStreamService.joinStream(runId, safeSince, sink);
        } catch (error) {
            if (!res.writableEnded) {
                this.logger.error(`joinStream failed: ${(error as Error).message}`);
                this.sendProtocolError(res, 'execution_error', (error as Error).message);
            }
        }
    }

    // ========== Private Helpers ==========

    private setSseHeaders(res: Response): void {
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('X-Accel-Buffering', 'no');
        res.flushHeaders();
    }

    private sendProtocolError(res: Response, code: string, message: string): void {
        if (!res.writableEnded) {
            res.write(`event: error\ndata: ${JSON.stringify({ error: code, message })}\n\n`);
            res.end();
        }
    }

    /**
     * 从 LangChain messages 数组中提取最后一条 human message 的 content
     */
    private extractLastUserMessage(
        messages: Array<{ type: string; content: string }>,
    ): string | null {
        for (let i = messages.length - 1; i >= 0; i--) {
            const msg = messages[i];
            if (msg.type === 'human') {
                return msg.content;
            }
        }
        return null;
    }

    /**
     * 将内部 Thread 模型转换为 LangGraph SDK 期望的格式
     */
    private toLangGraphThread(thread: {
        id: string;
        title: string | null;
        status: string;
        model: string | null;
        provider: string | null;
        createdAt: Date;
        updatedAt: Date;
    }): LangGraphThread {
        // LangGraph status 枚举：idle | busy | interrupted | error
        // 内部 status：active | archived | deleted
        // 映射：active → idle，其他 → idle（archived/deleted 不会出现在活跃查询中）
        const status: LangGraphThread['status'] = 'idle';

        return {
            thread_id: thread.id,
            metadata: {
                title: thread.title,
                model: thread.model,
                provider: thread.provider,
            },
            created_at: thread.createdAt.toISOString(),
            updated_at: thread.updatedAt.toISOString(),
            status,
            values: {},
        };
    }
}
