import type { BaseCheckpointSaver } from '@langchain/langgraph-checkpoint';
import type { RunEventStore } from '../../store/run-event-store';
import { RunContext } from '../run-context';

// Mock langgraph ESM modules
jest.mock('@langchain/langgraph', () => ({
    StateGraph: jest.fn().mockReturnValue({
        addNode: jest.fn().mockReturnThis(),
        addEdge: jest.fn().mockReturnThis(),
        addConditionalEdges: jest.fn().mockReturnThis(),
        compile: jest.fn().mockReturnValue({
            type: 'compiled-graph',
            stream: jest.fn(),
        }),
    }),
    START: '__start__',
    END: '__end__',
    Annotation: {
        Root: jest.fn().mockReturnValue({}),
    },
}));

// Mock ChatGraph
jest.mock('../../langgraph/graphs/chat-graph', () => ({
    ChatGraph: jest.fn().mockImplementation(() => ({
        name: 'chat',
        createGraph: jest.fn().mockReturnValue({
            compile: jest.fn().mockReturnValue({
                type: 'compiled-graph',
                stream: jest.fn(),
            }),
        }),
    })),
}));

describe('RunContext', () => {
    let context: RunContext;

    const mockCheckpointer = { type: 'memory-saver' } as unknown as BaseCheckpointSaver;
    const mockEventStore = { append: jest.fn() } as unknown as RunEventStore;

    beforeEach(() => {
        context = new RunContext(mockCheckpointer, mockEventStore);
    });

    describe('getCompiledGraph', () => {
        it('should compile and return a graph', () => {
            const graph = context.getCompiledGraph('default');
            expect(graph).toBeDefined();
        });

        it('should return the same graph for the same config key (LRU cache)', () => {
            const g1 = context.getCompiledGraph('default');
            const g2 = context.getCompiledGraph('default');
            expect(g1).toBe(g2);
        });

        it('should return different graphs for different config keys', () => {
            const g1 = context.getCompiledGraph('default');
            const g2 = context.getCompiledGraph('custom');
            expect(g1).not.toBe(g2);
        });
    });

    describe('properties', () => {
        it('should expose checkpointer', () => {
            expect(context.checkpointer).toBe(mockCheckpointer);
        });

        it('should expose eventStore', () => {
            expect(context.eventStore).toBe(mockEventStore);
        });
    });
});
