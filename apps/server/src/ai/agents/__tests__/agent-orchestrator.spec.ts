// biome-ignore lint: test file uses types for type inference
import { SocketRegistry } from '../../../ws/socket-registry';
import { AgentDefinition, AgentSession } from '../agent.types';
import { AgentHandler } from '../agent-handler';
import { AgentOrchestrator } from '../agent-orchestrator';
import { AgentRegistry } from '../agent-registry';
import { AgentStateStore } from '../agent-state-store';

function makeTestOrchestrator() {
    const emittedEvents: { event: string; data: unknown }[] = [];

    const mockSocketRegistry = {
        emitToClient: jest.fn((clientId: string, event: string, data: unknown) => {
            emittedEvents.push({ event, data });
        }),
    } as unknown as SocketRegistry;

    const editorDef: AgentDefinition = {
        role: 'editor',
        systemPrompt: 'You are an editor.',
        pipelineStage: 1,
        requiresApproval: true,
    };

    const writerDef: AgentDefinition = {
        role: 'writer',
        systemPrompt: 'You are a writer.',
        pipelineStage: 2,
        requiresApproval: true,
    };

    const mockAgentRegistry = {
        getByRoles: jest.fn((roles: string[]) => {
            const defs: AgentDefinition[] = [];
            if (roles.includes('editor')) defs.push(editorDef);
            if (roles.includes('writer')) defs.push(writerDef);
            return defs.sort((a, b) => a.pipelineStage - b.pipelineStage);
        }),
        getByRole: jest.fn((role: string) => {
            if (role === 'editor') return editorDef;
            if (role === 'writer') return writerDef;
            throw new Error(`Unknown agent role: ${role}`);
        }),
    } as unknown as AgentRegistry;

    const sessions = new Map<string, AgentSession>();
    const mockStateStore = {
        save: jest.fn((s: AgentSession) => sessions.set(s.sessionId, s)),
        get: jest.fn((id: string) => sessions.get(id)),
        delete: jest.fn(),
        activeSessionIds: [],
    } as unknown as AgentStateStore;

    let handlerCallCount = 0;
    const mockAgentHandler = {
        execute: jest.fn().mockImplementation(async () => {
            handlerCallCount++;
            return { output: `Agent output #${handlerCallCount}` };
        }),
    } as unknown as AgentHandler;

    const orchestrator = new AgentOrchestrator(
        mockAgentRegistry,
        mockStateStore,
        mockAgentHandler,
        mockSocketRegistry,
    );

    return {
        orchestrator,
        mockSocketRegistry,
        mockAgentRegistry,
        mockStateStore,
        mockAgentHandler,
        emittedEvents,
        sessions,
    };
}

describe('AgentOrchestrator', () => {
    it('should handle agent:start and run first agent', async () => {
        const { orchestrator, mockAgentHandler, emittedEvents } = makeTestOrchestrator();

        await orchestrator.handle({
            type: 'agent:start',
            clientId: 'test-client',
            payload: { topic: 'AI in 2026', agentRoles: ['editor', 'writer'] },
        });

        expect(mockAgentHandler.execute).toHaveBeenCalledTimes(1);
        expect(
            emittedEvents.some(
                e => e.event === 'agent:status' && (e.data as any).status === 'started',
            ),
        ).toBe(true);
    });

    it('should handle approve and run next agent', async () => {
        const { orchestrator, mockAgentHandler, sessions } = makeTestOrchestrator();

        // Start session
        await orchestrator.handle({
            type: 'agent:start',
            clientId: 'test-client',
            payload: { topic: 'AI in 2026', agentRoles: ['editor', 'writer'] },
        });

        // The session should be saved with editor awaiting approval
        const session = sessions.values().next().value as AgentSession;

        // Manually set the editor to awaiting_approval (since mock handler returns synchronously)
        session.agents[0].status = 'awaiting_approval';
        session.agents[0].output = 'Editor output';

        // Approve
        await orchestrator.handle({
            type: 'agent:approve',
            clientId: 'test-client',
            payload: { sessionId: session.sessionId },
        });

        // Should have run writer agent now
        expect(mockAgentHandler.execute).toHaveBeenCalledTimes(2);
        // Document should include editor output
        expect(session.document).toContain('Editor output');
    });

    it('should emit complete when all agents approved', async () => {
        const { orchestrator, sessions, emittedEvents } = makeTestOrchestrator();

        await orchestrator.handle({
            type: 'agent:start',
            clientId: 'test-client',
            payload: { topic: 'AI in 2026', agentRoles: ['editor', 'writer'] },
        });

        const session = sessions.values().next().value as AgentSession;
        session.agents[0].status = 'awaiting_approval';
        session.agents[0].output = 'Editor output';

        await orchestrator.handle({
            type: 'agent:approve',
            clientId: 'test-client',
            payload: { sessionId: session.sessionId },
        });

        // Set writer to awaiting_approval
        session.agents[1].status = 'awaiting_approval';
        session.agents[1].output = 'Writer output';

        await orchestrator.handle({
            type: 'agent:approve',
            clientId: 'test-client',
            payload: { sessionId: session.sessionId },
        });

        expect(session.status).toBe('complete');
        expect(
            emittedEvents.some(
                e => e.event === 'agent:status' && (e.data as any).status === 'complete',
            ),
        ).toBe(true);
    });

    it('should handle reject and re-run with reason', async () => {
        const { orchestrator, sessions, mockAgentHandler } = makeTestOrchestrator();

        await orchestrator.handle({
            type: 'agent:start',
            clientId: 'test-client',
            payload: { topic: 'AI in 2026', agentRoles: ['editor'] },
        });

        const session = sessions.values().next().value as AgentSession;
        session.agents[0].status = 'awaiting_approval';
        session.agents[0].retries = 0;

        await orchestrator.handle({
            type: 'agent:reject',
            clientId: 'test-client',
            payload: { sessionId: session.sessionId, reason: 'Too verbose' },
        });

        // Should have re-run the agent
        expect(mockAgentHandler.execute).toHaveBeenCalledTimes(2);
        expect(session.agents[0].retries).toBe(1);

        // Check that the reject reason was included in the input
        const secondCall = (mockAgentHandler.execute as jest.Mock).mock.calls[1];
        expect(secondCall[2]).toContain('Too verbose');
    });
});
