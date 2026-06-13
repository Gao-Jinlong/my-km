import { SpanStatusCode } from '@opentelemetry/api';
import { endToolSpan, startToolSpan } from './tool-node.span';

const startSpan = jest.fn();

jest.mock('@opentelemetry/api', () => ({
    SpanKind: { INTERNAL: 0 },
    SpanStatusCode: { OK: 1, ERROR: 2 },
    trace: {
        getTracer: jest.fn(() => ({ startSpan })),
    },
}));

describe('tool-node span instrumentation', () => {
    beforeEach(() => {
        startSpan.mockReset();
    });

    it('starts tool interrupt span with pending status attributes and event', () => {
        const span = {
            addEvent: jest.fn(),
            setAttribute: jest.fn(),
            setStatus: jest.fn(),
            end: jest.fn(),
        };
        startSpan.mockReturnValue(span);

        const result = startToolSpan({ toolName: 'doc_read', toolCallId: 'tc-1' });

        expect(result).toBe(span);
        expect(startSpan).toHaveBeenCalledWith('tool_node.interrupt', {
            kind: 0,
            attributes: {
                'tool.name': 'doc_read',
                'tool.call_id': 'tc-1',
                'tool.status': 'pending',
            },
        });
        expect(span.addEvent).toHaveBeenCalledWith('interrupt_sent', {
            'tool.status': 'pending',
        });
    });

    it('marks tool span as resumed before ending successfully', () => {
        const span = {
            addEvent: jest.fn(),
            setAttribute: jest.fn(),
            setStatus: jest.fn(),
            end: jest.fn(),
        };

        endToolSpan(span, undefined, 'resumed');

        expect(span.setAttribute).toHaveBeenCalledWith('tool.status', 'resumed');
        expect(span.addEvent).toHaveBeenCalledWith('interrupt_resumed', {
            'tool.status': 'resumed',
        });
        expect(span.setStatus).toHaveBeenCalledWith({ code: SpanStatusCode.OK });
        expect(span.end).toHaveBeenCalled();
    });
});
