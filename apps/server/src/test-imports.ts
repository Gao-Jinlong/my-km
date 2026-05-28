import 'reflect-metadata';
import { AgentHandler } from './ai/agents/agent-handler';
import { ToolDispatcher } from './ai/tools/tool.dispatcher';
import { ToolRouter } from './ai/tools/tool-router';
import { GraphRegistry } from './ai/workflow/graph-registry';
import { LLMResolver } from './ai/workflow/llm-resolver';

console.log('AgentHandler:', typeof AgentHandler);
console.log('GraphRegistry:', typeof GraphRegistry);
console.log('LLMResolver:', typeof LLMResolver);
console.log('ToolDispatcher:', typeof ToolDispatcher);
console.log('ToolRouter:', typeof ToolRouter);

const params = Reflect.getMetadata('design:paramtypes', AgentHandler);
console.log(
    'AgentHandler paramtypes:',
    params.map((p: any) => p?.name || 'undefined'),
);
