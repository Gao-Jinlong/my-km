import type { LLMConfig } from '../llm/provider.types';

/** Agent 角色定义，注册到 AgentRegistry */
export interface AgentDefinition {
    role: string;
    systemPrompt: string;
    llmConfig?: LLMConfig;
    pipelineStage: number;
    requiresApproval: boolean;
    maxRetries?: number;
}

/** 单个 agent 的运行时状态 */
export interface AgentState {
    agentId: string;
    role: string;
    status:
        | 'pending'
        | 'assigned'
        | 'running'
        | 'output_ready'
        | 'awaiting_approval'
        | 'approved'
        | 'rejected'
        | 'error'
        | 'cancelled';
    output?: string;
    retries: number;
    startedAt?: Date;
    completedAt?: Date;
}

/** 一次完整的写作 session */
export interface AgentSession {
    sessionId: string;
    clientId: string;
    topic: string;
    agents: AgentState[];
    document: string;
    status: 'running' | 'complete' | 'error' | 'cancelled';
    currentAgentIndex: number;
    createdAt: Date;
    abortController: AbortController;
}

/** Orchestrator dispatch callbacks */
export interface AgentCallbacks {
    onThinking(sessionId: string, agentId: string, chunk: string): void;
    onOutput(sessionId: string, agentId: string, content: string): void;
    onError(sessionId: string, agentId: string, error: string): void;
    onStatus(sessionId: string, agentId: string, status: string): void;
}

// === Inbound message payloads ===

export interface AgentStartPayload {
    sessionId?: string;
    topic: string;
    agentRoles: string[];
}

export interface AgentApprovePayload {
    sessionId: string;
}

export interface AgentRejectPayload {
    sessionId: string;
    reason: string;
}

export interface AgentIntervenePayload {
    sessionId: string;
    modification: string;
}
