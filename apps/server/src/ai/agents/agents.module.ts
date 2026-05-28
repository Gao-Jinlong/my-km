import { forwardRef, Module, OnModuleInit } from '@nestjs/common';
import { MessageBus } from '../../ws/message-bus';
import { WsModule } from '../../ws/ws.module';
import { AiModule } from '../ai.module';
import { ToolDispatcher } from '../tools/tool.dispatcher';
import { ToolRouter } from '../tools/tool-router';
import { GraphRegistry } from '../workflow/graph-registry';
import { LLMResolver } from '../workflow/llm-resolver';
import { AgentHandler } from './agent-handler';
import { AgentOrchestrator } from './agent-orchestrator';
import { AgentRegistry } from './agent-registry';
import { AgentStateStore } from './agent-state-store';
import { editorAgent } from './agents/editor.agent';
import { writerAgent } from './agents/writer.agent';

@Module({
    imports: [forwardRef(() => AiModule), WsModule],
    providers: [AgentRegistry, AgentStateStore, AgentHandler, AgentOrchestrator],
    exports: [AgentRegistry],
})
export class AgentsModule implements OnModuleInit {
    constructor(
        private agentRegistry: AgentRegistry,
        private messageBus: MessageBus,
        private agentOrchestrator: AgentOrchestrator,
    ) {}

    onModuleInit() {
        // Register built-in agent definitions
        this.agentRegistry.register(editorAgent);
        this.agentRegistry.register(writerAgent);

        // Register orchestrator as MessageBus handler
        this.messageBus.subscribe(this.agentOrchestrator);
    }
}
