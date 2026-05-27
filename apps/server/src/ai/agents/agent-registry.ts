import { Injectable, Logger } from '@nestjs/common';
import type { AgentDefinition } from './agent.types';

@Injectable()
export class AgentRegistry {
    private readonly logger = new Logger(AgentRegistry.name);
    private agents = new Map<string, AgentDefinition>();

    register(agent: AgentDefinition): void {
        if (this.agents.has(agent.role)) {
            this.logger.warn(`Overwriting existing agent role: ${agent.role}`);
        }
        this.agents.set(agent.role, agent);
        this.logger.log(`Agent registered: ${agent.role} (stage: ${agent.pipelineStage})`);
    }

    getByRole(role: string): AgentDefinition {
        const agent = this.agents.get(role);
        if (!agent) {
            const available = Array.from(this.agents.keys());
            throw new Error(
                `Unknown agent role "${role}". Available: ${available.join(', ') || 'none'}`,
            );
        }
        return agent;
    }

    getByRoles(roles: string[]): AgentDefinition[] {
        const agents = roles.map(role => this.getByRole(role));
        return agents.sort((a, b) => a.pipelineStage - b.pipelineStage);
    }

    get registeredRoles(): string[] {
        return Array.from(this.agents.keys());
    }
}
