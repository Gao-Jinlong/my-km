/**
 * RunContextFactory — 创建 per-run RunContext 的工厂
 *
 * 在 AiChatService.startRun() 中显式调用，为每个 run 创建独立的 RunContext 快照。
 * 不使用 NestJS Scope（transient/request），因为 run 的生命周期不等同于 provider 生命周期。
 */

import { Injectable } from '@nestjs/common';
import { CheckpointerProvider } from '../checkpointer/checkpointer.provider';
import { EventBus } from '../event/event-bus';
import type { LLMConfig } from '../llm/provider.types';
import { RunEventStore } from '../store/run-event-store';
import { RunContext, type RunContextOpts } from './run-context';

export interface CreateRunContextOpts {
    /** LLM 配置（会被深克隆冻结） */
    llmConfig: LLMConfig;
}

@Injectable()
export class RunContextFactory {
    constructor(
        private readonly checkpointerProvider: CheckpointerProvider,
        private readonly eventStore: RunEventStore,
        private readonly eventBus: EventBus,
    ) {}

    /**
     * 创建一个新的 per-run RunContext
     *
     * - checkpointer 和 eventStore 是 singleton，跨 run 共享引用
     * - llmConfig 会被深克隆并冻结
     */
    async create(opts: CreateRunContextOpts): Promise<RunContext> {
        const checkpointer = await this.checkpointerProvider.getCheckpointer();

        return new RunContext({
            checkpointer,
            eventStore: this.eventStore,
            eventBus: this.eventBus,
            llmConfig: opts.llmConfig,
        } satisfies RunContextOpts);
    }
}
