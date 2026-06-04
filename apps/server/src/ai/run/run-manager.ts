/**
 * RunManager — Run 生命周期管理
 *
 * 负责：
 * - 创建和追踪活跃的 RunRecord
 * - 按 thread 查找活跃 Run（用于并发控制）
 * - 取消 Run
 * - 清理已完成的 Run（释放内存）
 */

import { Injectable, Logger } from '@nestjs/common';
import { RunEventStore } from '../store/run-event-store';
import { RunStatus } from '../types/run.types';
import { RunRecord } from './run-record';

const ACTIVE_STATUSES: RunStatus[] = [RunStatus.Pending, RunStatus.Running, RunStatus.Interrupted];

@Injectable()
export class RunManager {
    private readonly logger = new Logger(RunManager.name);
    private readonly runs = new Map<string, RunRecord>();
    private runCounter = 0;

    constructor(private readonly eventStore: RunEventStore) {}

    /**
     * 创建新的 RunRecord
     *
     * @param threadId Thread ID
     * @param checkpointer 从 RunContext 传入（由 AiModule 工厂注入）
     */
    createRun(threadId: string, checkpointer: any): RunRecord {
        this.runCounter++;
        const id = `run-${Date.now()}-${this.runCounter}`;

        const record = new RunRecord({
            id,
            threadId,
            eventStore: this.eventStore,
            checkpointer,
        });

        this.runs.set(id, record);
        this.logger.log(`Run created: ${id} for thread: ${threadId}`);
        return record;
    }

    /**
     * 获取 RunRecord by ID
     */
    getRun(runId: string): RunRecord | undefined {
        return this.runs.get(runId);
    }

    /**
     * 获取指定 thread 的活跃 Run
     */
    getActiveRunForThread(threadId: string): RunRecord | undefined {
        for (const run of this.runs.values()) {
            if (run.threadId === threadId && ACTIVE_STATUSES.includes(run.status)) {
                return run;
            }
        }
        return undefined;
    }

    /**
     * 取消指定 Run
     */
    cancelRun(runId: string): void {
        const run = this.runs.get(runId);
        if (run) {
            run.abort();
            this.logger.log(`Run cancelled: ${runId}`);
        }
    }

    /**
     * 清理已完成的 Run（释放内存）
     */
    cleanup(): void {
        for (const [id, run] of this.runs.entries()) {
            if (!ACTIVE_STATUSES.includes(run.status)) {
                this.runs.delete(id);
            }
        }
    }
}
