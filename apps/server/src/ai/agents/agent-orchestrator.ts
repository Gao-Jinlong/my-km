import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { BusMessage, MessageHandler } from '../../ws/message-bus';
import { SocketRegistry } from '../../ws/socket-registry';
import type {
    AgentApprovePayload,
    AgentIntervenePayload,
    AgentRejectPayload,
    AgentSession,
    AgentStartPayload,
    AgentState,
} from './agent.types';
import { AgentHandler } from './agent-handler';
import { AgentRegistry } from './agent-registry';
import { AgentStateStore } from './agent-state-store';

@Injectable()
export class AgentOrchestrator implements MessageHandler {
    readonly allowedTypes = new Set([
        'agent:start',
        'agent:approve',
        'agent:reject',
        'agent:intervene',
    ]);

    private readonly logger = new Logger(AgentOrchestrator.name);

    constructor(
        private agentRegistry: AgentRegistry,
        private stateStore: AgentStateStore,
        private agentHandler: AgentHandler,
        private socketRegistry: SocketRegistry,
    ) {}

    async handle(msg: BusMessage): Promise<void> {
        const payload = msg.payload as Record<string, unknown>;

        switch (msg.type) {
            case 'agent:start':
                await this.handleStart(msg.clientId, payload as AgentStartPayload);
                break;
            case 'agent:approve':
                await this.handleApprove(msg.clientId, payload as AgentApprovePayload);
                break;
            case 'agent:reject':
                await this.handleReject(msg.clientId, payload as AgentRejectPayload);
                break;
            case 'agent:intervene':
                await this.handleIntervene(msg.clientId, payload as AgentIntervenePayload);
                break;
        }
    }

    private async handleStart(clientId: string, payload: AgentStartPayload): Promise<void> {
        const sessionId = payload.sessionId ?? randomUUID();
        const { topic, agentRoles } = payload;

        this.logger.log(
            `Starting agent session: ${sessionId} topic="${topic}" roles=[${agentRoles}]`,
        );

        const agentDefs = this.agentRegistry.getByRoles(agentRoles);
        const agents: AgentState[] = agentDefs.map(def => ({
            agentId: `${sessionId}--${def.role}`,
            role: def.role,
            status: 'pending',
            retries: 0,
        }));

        const session: AgentSession = {
            sessionId,
            clientId,
            topic,
            agents,
            document: '',
            status: 'running',
            currentAgentIndex: 0,
            createdAt: new Date(),
            abortController: new AbortController(),
        };

        this.stateStore.save(session);
        this.emitToClient(session, 'agent:status', {
            sessionId,
            status: 'started',
        });

        await this.runCurrentAgent(session);
    }

    private async handleApprove(_clientId: string, payload: AgentApprovePayload): Promise<void> {
        const session = this.stateStore.get(payload.sessionId);
        if (!session) {
            this.logger.warn(`Approve for unknown session: ${payload.sessionId}`);
            return;
        }

        const currentAgent = session.agents[session.currentAgentIndex];
        if (!currentAgent || currentAgent.status !== 'awaiting_approval') {
            this.logger.warn(`Approve for session not awaiting approval: ${payload.sessionId}`);
            return;
        }

        currentAgent.status = 'approved';
        currentAgent.completedAt = new Date();
        if (currentAgent.output) {
            session.document += (session.document ? '\n\n' : '') + currentAgent.output;
        }

        session.currentAgentIndex++;

        if (session.currentAgentIndex >= session.agents.length) {
            session.status = 'complete';
            this.emitToClient(session, 'agent:status', {
                sessionId: session.sessionId,
                status: 'complete',
                document: session.document,
            });
            this.stateStore.save(session);
            return;
        }

        this.stateStore.save(session);
        await this.runCurrentAgent(session);
    }

    private async handleReject(_clientId: string, payload: AgentRejectPayload): Promise<void> {
        const session = this.stateStore.get(payload.sessionId);
        if (!session) {
            this.logger.warn(`Reject for unknown session: ${payload.sessionId}`);
            return;
        }

        const currentAgent = session.agents[session.currentAgentIndex];
        const agentDef = this.agentRegistry.getByRole(currentAgent.role);
        const maxRetries = agentDef.maxRetries ?? 3;

        if (currentAgent.retries >= maxRetries) {
            currentAgent.status = 'error';
            session.status = 'error';
            this.emitToClient(session, 'agent:error', {
                sessionId: session.sessionId,
                agentId: currentAgent.agentId,
                error: `Max retries (${maxRetries}) exceeded`,
            });
            this.stateStore.save(session);
            return;
        }

        currentAgent.retries++;
        const modifiedInput = `${session.topic}\n\nPrevious output was rejected: ${payload.reason}\nPlease revise.`;
        this.stateStore.save(session);
        await this.runAgentWithInput(session, modifiedInput);
    }

    private async handleIntervene(
        _clientId: string,
        payload: AgentIntervenePayload,
    ): Promise<void> {
        const session = this.stateStore.get(payload.sessionId);
        if (!session) {
            this.logger.warn(`Intervene for unknown session: ${payload.sessionId}`);
            return;
        }

        const modifiedInput = `${session.topic}\n\nUser modification: ${payload.modification}\nPlease incorporate this change.`;
        this.stateStore.save(session);
        await this.runAgentWithInput(session, modifiedInput);
    }

    private async runCurrentAgent(session: AgentSession): Promise<void> {
        this.agentRegistry.getByRole(session.agents[session.currentAgentIndex].role);
        await this.runAgentWithInput(session, session.topic);
    }

    private async runAgentWithInput(session: AgentSession, input: string): Promise<void> {
        const currentAgent = session.agents[session.currentAgentIndex];
        const agentDef = this.agentRegistry.getByRole(currentAgent.role);

        currentAgent.status = 'running';
        currentAgent.startedAt = new Date();
        this.stateStore.save(session);
        this.emitToClient(session, 'agent:status', {
            sessionId: session.sessionId,
            agentId: currentAgent.agentId,
            status: 'running',
        });

        const callbacks = {
            onThinking: (_sessionId: string, agentId: string, chunk: string) => {
                this.emitToClient(session, 'agent:thinking', {
                    sessionId: session.sessionId,
                    agentId,
                    chunk,
                });
            },
            onOutput: (_sessionId: string, agentId: string, content: string) => {
                this.emitToClient(session, 'agent:output', {
                    sessionId: session.sessionId,
                    agentId,
                    content,
                });
            },
            onError: (_sessionId: string, agentId: string, error: string) => {
                this.emitToClient(session, 'agent:error', {
                    sessionId: session.sessionId,
                    agentId,
                    error,
                });
            },
            onStatus: (_sessionId: string, agentId: string, status: string) => {
                this.emitToClient(session, 'agent:status', {
                    sessionId: session.sessionId,
                    agentId,
                    status,
                });
            },
        };

        try {
            const result = await this.agentHandler.execute(
                agentDef,
                session.sessionId,
                input,
                callbacks,
                session.abortController.signal,
            );

            currentAgent.output = result.output;
            currentAgent.completedAt = new Date();

            if (agentDef.requiresApproval) {
                currentAgent.status = 'awaiting_approval';
                this.emitToClient(session, 'agent:status', {
                    sessionId: session.sessionId,
                    agentId: currentAgent.agentId,
                    status: 'awaiting_approval',
                });
            } else {
                currentAgent.status = 'approved';
                session.document += (session.document ? '\n\n' : '') + result.output;
                session.currentAgentIndex++;

                if (session.currentAgentIndex >= session.agents.length) {
                    session.status = 'complete';
                    this.emitToClient(session, 'agent:status', {
                        sessionId: session.sessionId,
                        status: 'complete',
                        document: session.document,
                    });
                } else {
                    this.stateStore.save(session);
                    await this.runCurrentAgent(session);
                }
            }

            this.stateStore.save(session);
        } catch (error) {
            currentAgent.status = 'error';
            session.status = 'error';
            this.emitToClient(session, 'agent:error', {
                sessionId: session.sessionId,
                agentId: currentAgent.agentId,
                error: error instanceof Error ? error.message : 'Unknown error',
            });
            this.stateStore.save(session);
        }
    }

    private emitToClient(session: AgentSession, event: string, data: unknown): void {
        this.socketRegistry.emitToClient(session.clientId, event, data);
    }
}
