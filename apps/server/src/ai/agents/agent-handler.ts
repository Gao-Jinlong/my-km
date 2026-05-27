import { Injectable, Logger } from '@nestjs/common';
import type { ToolDispatcher } from '../tools/tool.dispatcher';
import type { ToolRouter } from '../tools/tool-router';
import type { GraphRegistry } from '../workflow/graph-registry';
import type { LLMResolver } from '../workflow/llm-resolver';
import type { AgentCallbacks, AgentDefinition } from './agent.types';
import { AgentExecutor, type AgentExecutorCtx } from './agent-executor';

@Injectable()
export class AgentHandler {
    private readonly logger = new Logger(AgentHandler.name);

    constructor(
        private graphRegistry: GraphRegistry,
        private llmResolver: LLMResolver,
        private toolDispatcher: ToolDispatcher,
        private toolRouter: ToolRouter,
    ) {}

    async execute(
        agentDef: AgentDefinition,
        sessionId: string,
        input: string,
        callbacks: AgentCallbacks,
        abortSignal: AbortSignal,
    ): Promise<{ output: string }> {
        const agentId = `${sessionId}--${agentDef.role}`;

        const ctx: AgentExecutorCtx = {
            sessionId,
            agentId,
            input,
            callbacks,
            abortSignal,
            llmConfig: agentDef.llmConfig,
            graphName: 'chat',
        };

        const executor = new AgentExecutor(ctx, {
            graphRegistry: this.graphRegistry,
            llmResolver: this.llmResolver,
            toolDispatcher: this.toolDispatcher,
            toolRouter: this.toolRouter,
        });

        return executor.execute();
    }
}
