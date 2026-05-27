import type { AgentDefinition } from '../agent.types';
import { AgentRegistry } from '../agent-registry';

describe('AgentRegistry', () => {
    let registry: AgentRegistry;

    const editorAgent: AgentDefinition = {
        role: 'editor',
        systemPrompt: 'You are an editor.',
        pipelineStage: 1,
        requiresApproval: true,
    };

    const writerAgent: AgentDefinition = {
        role: 'writer',
        systemPrompt: 'You are a writer.',
        pipelineStage: 2,
        requiresApproval: true,
    };

    beforeEach(() => {
        registry = new AgentRegistry();
    });

    it('should register and retrieve by role', () => {
        registry.register(editorAgent);
        expect(registry.getByRole('editor')).toBe(editorAgent);
    });

    it('should throw for unknown role', () => {
        expect(() => registry.getByRole('unknown')).toThrow('Unknown agent role');
    });

    it('should getByRoles and sort by pipelineStage', () => {
        registry.register(writerAgent);
        registry.register(editorAgent);
        const result = registry.getByRoles(['writer', 'editor']);
        expect(result[0].role).toBe('editor');
        expect(result[1].role).toBe('writer');
    });

    it('should list registered roles', () => {
        registry.register(editorAgent);
        registry.register(writerAgent);
        expect(registry.registeredRoles).toEqual(expect.arrayContaining(['editor', 'writer']));
    });
});
