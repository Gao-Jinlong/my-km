import type { RegisteredTool } from '../tool.types';
import { ToolRouteDecision, ToolRouter } from '../tool-router';

describe('ToolRouter', () => {
    let router: ToolRouter;
    let decisions: ToolRouteDecision[] = [];

    const mockBackendLow: RegisteredTool = {
        name: 'web_search',
        definition: { name: 'web_search', description: 'Search', input_schema: {} },
        execution: 'backend',
        danger: 'low',
    };
    const mockBackendHigh: RegisteredTool = {
        name: 'delete_file',
        definition: { name: 'delete_file', description: 'Delete', input_schema: {} },
        execution: 'backend',
        danger: 'high',
    };
    const mockFrontend: RegisteredTool = {
        name: 'edit_text',
        definition: { name: 'edit_text', description: 'Edit', input_schema: {} },
        execution: 'frontend',
    };

    beforeEach(() => {
        router = new ToolRouter();
        router.registerMany([mockBackendLow, mockBackendHigh, mockFrontend]);
        decisions = [];
    });

    function captureDecision(toolName: string, input: unknown) {
        return new Promise<ToolRouteDecision>(resolve => {
            router.onDecision(d => {
                decisions.push(d);
                resolve(d);
            });
            router.route(toolName, input, 'room-1', 'tc-1');
        });
    }

    it('routes backend+low to auto-execute', async () => {
        const decision = await captureDecision('web_search', { query: 'test' });
        expect(decision.mode).toBe('auto_execute');
        expect(decision.requiresConfirmation).toBe(false);
    });

    it('routes backend+high to confirm-then-execute', async () => {
        const decision = await captureDecision('delete_file', { path: '/tmp/x' });
        expect(decision.mode).toBe('frontend_confirm');
        expect(decision.requiresConfirmation).toBe(true);
    });

    it('routes frontend to direct-frontend', async () => {
        const decision = await captureDecision('edit_text', { text: 'hello' });
        expect(decision.mode).toBe('frontend_direct');
        expect(decision.requiresConfirmation).toBe(false);
    });

    it('emits error for unknown tool', async () => {
        const decision = await captureDecision('unknown_tool', {});
        expect(decision.mode).toBe('error');
    });

    it('emits event with roomId and toolCallId', async () => {
        const decision = await captureDecision('delete_file', { path: '/tmp/x' });
        expect(decision.roomId).toBe('room-1');
        expect(decision.toolCallId).toBe('tc-1');
    });
});
