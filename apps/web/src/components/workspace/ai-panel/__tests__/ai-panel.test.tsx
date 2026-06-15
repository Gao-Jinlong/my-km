import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AIPanel } from '../ai-panel';

const mocks = vi.hoisted(() => {
    const useLangGraphStream = vi.fn();
    const messageBubble = vi.fn(({ message }) => (
        <div data-role={message.role} data-testid="message-bubble">
            {message.content}
        </div>
    ));

    return {
        useLangGraphStream,
        messageBubble,
    };
});

vi.mock('@/features/ai/sdk/editor-context', () => ({
    collectEditorContext: vi.fn(() => null),
}));

vi.mock('@/hooks/use-langgraph-stream', () => ({
    useLangGraphStream: mocks.useLangGraphStream,
}));

const workspaceState = {
    toggleAIPanel: vi.fn(),
    aiViewMode: 'chat',
    setAIPanelViewMode: vi.fn(),
};

vi.mock('@/stores/workspace-store', () => ({
    useWorkspaceStore: vi.fn(() => workspaceState),
}));

vi.mock('../ai-header', () => ({
    AIHeader: () => <div data-testid="ai-header" />,
}));

vi.mock('../conversation-list', () => ({
    ConversationList: () => <div data-testid="conversation-list" />,
}));

vi.mock('../message-bubble', () => ({
    MessageBubble: mocks.messageBubble,
}));

vi.mock('../context-badge', () => ({
    ContextBadge: () => <div data-testid="context-badge" />,
}));

function baseStreamReturn() {
    return {
        messages: [
            {
                id: 'ai-1',
                role: 'ai',
                content: 'Hello from LangGraph',
                toolCalls: undefined,
                toolCallId: undefined,
            },
        ],
        isStreaming: false,
        isLastMessageStreaming: false,
        error: null,
        threadId: 'thread-1',
        runId: 'run-1',
        interrupt: null,
        openThread: vi.fn(),
        sendMessage: vi.fn(),
        resumeWithToolResult: vi.fn(),
        stop: vi.fn(),
    };
}

describe('AIPanel LangGraph rendering', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        Element.prototype.scrollIntoView = vi.fn();
        mocks.useLangGraphStream.mockReturnValue(baseStreamReturn());
    });

    it('renders LangGraph runtime messages directly', () => {
        render(<AIPanel />);

        expect(screen.getByText('Hello from LangGraph')).toBeTruthy();
        expect(mocks.messageBubble).toHaveBeenCalledWith(
            expect.objectContaining({
                message: expect.objectContaining({
                    role: 'ai',
                    content: 'Hello from LangGraph',
                }),
            }),
            undefined,
        );
    });
});
