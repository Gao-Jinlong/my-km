import { RegisteredTool, ToolDanger, ToolExecution } from '../tool.types';

describe('RegisteredTool metadata', () => {
    it('supports execution field for routing', () => {
        const tool: RegisteredTool = {
            name: 'web_search',
            definition: {
                name: 'web_search',
                description: 'Search the web',
                input_schema: { type: 'object', properties: {} },
            },
            execution: 'backend',
            danger: 'low',
        };
        expect(tool.execution).toBe('backend');
        expect(tool.danger).toBe('low');
    });

    it('supports frontend execution without danger', () => {
        const tool: RegisteredTool = {
            name: 'edit_text',
            definition: {
                name: 'edit_text',
                description: 'Edit text in editor',
                input_schema: { type: 'object', properties: {} },
            },
            execution: 'frontend',
        };
        expect(tool.execution).toBe('frontend');
        expect(tool.danger).toBeUndefined();
    });
});
