import { render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AIPanel } from '../ai-panel';

const mocks = vi.hoisted(() => {
    const dispatch = vi.fn().mockResolvedValue({ success: true });
    const register = vi.fn();
    const onConfirmationRequest = vi.fn(() => ({ dispose: vi.fn() }));
    const useLangGraphStream = vi.fn();

    return {
        dispatch,
        register,
        onConfirmationRequest,
        useLangGraphStream,
    };
});

vi.mock('@/features/ai/tools/frontend-tool-executor', () => ({
    FrontendToolExecutor: vi.fn().mockImplementation(() => ({
        dispatch: mocks.dispatch,
        register: mocks.register,
        onConfirmationRequest: mocks.onConfirmationRequest,
    })),
}));

vi.mock('@/features/ai/tools/handlers/file-ops', () => ({
    FileOpsHandler: class FileOpsHandler {},
}));

vi.mock('@/features/ai/tools/handlers/doc-read', () => ({
    DocReadHandler: class DocReadHandler {},
}));

vi.mock('@/features/ai/tools/handlers/doc-edit', () => ({
    DocEditHandler: class DocEditHandler {},
}));

vi.mock('@/features/ai/tools/handlers/search', () => ({
    SearchHandler: class SearchHandler {},
}));

vi.mock('@/features/ai/sdk/editor-context', () => ({
    collectEditorContext: vi.fn(() => null),
}));

vi.mock('@/hooks/use-langgraph-stream', () => ({
    useLangGraphStream: mocks.useLangGraphStream,
}));

vi.mock('@/platform/bootstrap', () => ({
    container: {
        get: vi.fn(() => ({})),
    },
}));

vi.mock('@/features/editor', () => ({
    EditorContainer: class EditorContainer {},
}));

vi.mock('@/platform/document-store', () => ({
    DocumentStore: class DocumentStore {},
}));

vi.mock('@/platform/file-system', () => ({
    FileSystemService: class FileSystemService {},
}));

const workspaceState = {
    toggleAIPanel: vi.fn(),
    aiViewMode: 'chat',
    setAIPanelViewMode: vi.fn(),
    project: {
        currentProject: { id: 'p1', name: 'my-km', rootHandle: {}, openedAt: 1 },
    },
};

vi.mock('@/stores/workspace-store', () => {
    const useWorkspaceStore = vi.fn(() => workspaceState) as ReturnType<typeof vi.fn> & {
        getState: ReturnType<typeof vi.fn>;
    };
    useWorkspaceStore.getState = vi.fn(() => workspaceState);
    return { useWorkspaceStore };
});

vi.mock('../ai-header', () => ({
    AIHeader: () => <div data-testid="ai-header" />,
}));

vi.mock('../conversation-list', () => ({
    ConversationList: () => <div data-testid="conversation-list" />,
}));

vi.mock('../message-bubble', () => ({
    MessageBubble: () => <div data-testid="message-bubble" />,
}));

vi.mock('../context-badge', () => ({
    ContextBadge: () => <div data-testid="context-badge" />,
}));

function baseStreamReturn(traceContext: { traceId: string; spanId: string; traceparent: string }) {
    return {
        messages: [],
        isStreaming: true,
        isLastMessageStreaming: false,
        error: null,
        threadId: 'thread-1',
        runId: 'run-1',
        interrupt: {
            toolCallId: 'tc-1',
            toolName: 'file_ops',
            input: { operation: 'create', path: 'notes/new.km', type: 'file' },
        },
        traceContext,
        sendMessage: vi.fn(),
        resumeWithToolResult: vi.fn(),
        stop: vi.fn(),
    };
}

describe('AIPanel frontend tool dispatch', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        Element.prototype.scrollIntoView = vi.fn();
    });

    it('does not dispatch the same interrupt again when only trace context identity changes', async () => {
        mocks.useLangGraphStream.mockReturnValue(
            baseStreamReturn({
                traceId: 'trace-1',
                spanId: 'span-1',
                traceparent: '00-trace-1-span-1-01',
            }),
        );

        const { rerender } = render(<AIPanel />);

        await waitFor(() => expect(mocks.dispatch).toHaveBeenCalledTimes(1));

        mocks.useLangGraphStream.mockReturnValue(
            baseStreamReturn({
                traceId: 'trace-1',
                spanId: 'span-1',
                traceparent: '00-trace-1-span-1-01',
            }),
        );
        rerender(<AIPanel />);

        await waitFor(() => expect(mocks.dispatch).toHaveBeenCalledTimes(1));
    });
});
