/**
 * Type declaration for optional dependency @langchain/langgraph-checkpoint-postgres
 *
 * This package may not be installed in all environments.
 * It's only needed when CHECKPOINTER_BACKEND=postgres.
 * The actual import is done dynamically at runtime.
 */
declare module '@langchain/langgraph-checkpoint-postgres' {
    import type { BaseCheckpointSaver } from '@langchain/langgraph-checkpoint';

    export class PostgresSaver extends BaseCheckpointSaver {
        static fromConnString(connectionString: string): PostgresSaver;
        setup(): Promise<void>;
        end(): Promise<void>;
    }
}
