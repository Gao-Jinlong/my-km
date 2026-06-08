/**
 * RunContext — 单次 Run 创建时的执行上下文快照
 *
 * 每个 run 在创建时持有自己的 RunContext 实例。
 * RunContext 是该 run 创建瞬间的上下文快照：
 * - 默认模型、动态配置的后续变化不影响这个 run
 * - eventStore、checkpointer 等 singleton infra 通过 RunContext 统一传递
 *
 * 本阶段只保证进程内 resume：
 * - 同进程内的 interrupted run 可以 resume，并复用原 RunContext
 * - 服务重启后，RunRecord 和 RunContext 快照不存在
 *
 * graph 编译不属于 RunContext，应移动到 executeRun() 流程中。
 *
 * 注意：编辑器上下文（editor context）不属于运行环境，
 * 通过 RunExecutionSnapshot.requestContext 传入 executeRunProtocol，
 * 由 formatEditorContext() 格式化后合并到 HumanMessage 中。
 */

import type { BaseCheckpointSaver } from '@langchain/langgraph-checkpoint';
import type { LLMConfig } from '../llm/provider.types';
import type { RunEventStore } from '../store/run-event-store';
import { snapshotValue } from '../utils/snapshot';

export interface RunContextOpts {
    /** LangGraph checkpointer 单例 */
    checkpointer: BaseCheckpointSaver;
    /** Run 事件流存储器 */
    eventStore: RunEventStore;
    /** LLM 配置快照（run 创建时冻结） */
    llmConfig: LLMConfig;
}

export class RunContext {
    /** LangGraph checkpointer 单例 */
    readonly checkpointer: BaseCheckpointSaver;
    /** Run 事件流存储器 */
    readonly eventStore: RunEventStore;
    /** LLM 配置快照（run 创建时冻结，后续不可修改） */
    readonly llmConfig: Readonly<LLMConfig>;

    constructor(opts: RunContextOpts) {
        this.checkpointer = opts.checkpointer;
        this.eventStore = opts.eventStore;
        this.llmConfig = snapshotValue(opts.llmConfig);
    }
}
