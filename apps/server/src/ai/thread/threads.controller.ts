/**
 * ThreadsController — LangGraph Platform 协议兼容的 Thread 控制器（瘦身版）
 *
 * 只负责 Thread 资源 CRUD + state，纯路由 + DTO 映射。
 * Run 相关端点（streamRun/cancel/joinStream）在 RunsController。
 *
 * 实现 @langchain/langgraph-sdk Client 期望的接口：
 *   POST   /api/threads                → createThread
 *   POST   /api/threads/search         → searchThreads
 *   GET    /api/threads/:id            → getThread
 *   PATCH  /api/threads/:id            → updateThread
 *   DELETE /api/threads/:id            → deleteThread
 *   GET    /api/threads/:id/state      → getThreadState
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
} from '@nestjs/common';
import { SkipResponseWrap } from '../../common/decorators/skip-response-wrap.decorator';
import { CheckpointReaderService } from '../checkpointer/checkpoint-reader.service';
import type {
    CreateThreadBody,
    LangGraphThread,
    SearchThreadsBody,
    UpdateThreadBody,
} from './langgraph-thread.dto';
import { toLangGraphThread } from './thread-dto.mapper';
import { ThreadService } from './thread.service';

@Controller('threads')
@SkipResponseWrap()
export class ThreadsController {
    private readonly logger = new Logger(ThreadsController.name);

    constructor(
        private readonly threadService: ThreadService,
        private readonly checkpointReader: CheckpointReaderService,
    ) {}

    /** POST /api/threads — 创建 Thread */
    @Post()
    async createThread(@Body() body: CreateThreadBody): Promise<LangGraphThread> {
        const title = typeof body.metadata?.title === 'string' ? body.metadata.title : undefined;
        const thread = await this.threadService.create({ id: body.thread_id, title });
        return toLangGraphThread(thread);
    }

    /** POST /api/threads/search — 搜索/列出 Threads */
    @Post('search')
    async searchThreads(@Body() body: SearchThreadsBody): Promise<LangGraphThread[]> {
        const threads = await this.threadService.findAll({
            limit: body.limit ?? 10,
            offset: body.offset ?? 0,
        });
        return threads.map(toLangGraphThread);
    }

    /** GET /api/threads/:threadId */
    @Get(':threadId')
    async getThread(@Param('threadId') threadId: string): Promise<LangGraphThread> {
        const thread = await this.threadService.findById(threadId);
        if (!thread) {
            throw new NotFoundException(`Thread not found: ${threadId}`);
        }
        return toLangGraphThread(thread);
    }

    /** PATCH /api/threads/:threadId */
    @Patch(':threadId')
    async updateThread(
        @Param('threadId') threadId: string,
        @Body() body: UpdateThreadBody,
    ): Promise<LangGraphThread> {
        const title = typeof body.metadata?.title === 'string' ? body.metadata.title : undefined;
        const updated = await this.threadService.update(threadId, { title });
        return toLangGraphThread(updated);
    }

    /** DELETE /api/threads/:threadId — 软删除 */
    @Delete(':threadId')
    async deleteThread(@Param('threadId') threadId: string): Promise<void> {
        await this.threadService.delete(threadId);
    }

    /** GET /api/threads/:threadId/state — 获取 Thread 当前状态（LangGraph ThreadState 格式） */
    @Get(':threadId/state')
    async getThreadState(@Param('threadId') threadId: string) {
        return this.checkpointReader.getThreadState(threadId);
    }
}
