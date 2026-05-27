import { Injectable, Logger } from '@nestjs/common';
import type { AgentSession } from './agent.types';

@Injectable()
export class AgentStateStore {
    private readonly logger = new Logger(AgentStateStore.name);
    private sessions = new Map<string, AgentSession>();

    save(session: AgentSession): void {
        this.sessions.set(session.sessionId, session);
    }

    get(sessionId: string): AgentSession | undefined {
        return this.sessions.get(sessionId);
    }

    delete(sessionId: string): void {
        this.sessions.delete(sessionId);
    }

    get activeSessionIds(): string[] {
        return Array.from(this.sessions.keys());
    }
}
