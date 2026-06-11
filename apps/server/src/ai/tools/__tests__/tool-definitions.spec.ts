import { FRONTEND_TOOLS, frontendTools, isFrontendTool } from '../tool-definitions';

describe('tool-definitions', () => {
    describe('FRONTEND_TOOLS', () => {
        it('应该包含 4 个工具名', () => {
            expect(FRONTEND_TOOLS.size).toBe(4);
            expect(FRONTEND_TOOLS.has('get_document_content')).toBe(true);
            expect(FRONTEND_TOOLS.has('get_child_items')).toBe(true);
            expect(FRONTEND_TOOLS.has('insert_text')).toBe(true);
            expect(FRONTEND_TOOLS.has('splice_text')).toBe(true);
        });
    });

    describe('frontendTools', () => {
        it('应该包含 4 个 LangChain Tool 实例', () => {
            expect(frontendTools.length).toBe(4);
            const names = frontendTools.map(t => t.name).sort();
            expect(names).toEqual([
                'get_child_items',
                'get_document_content',
                'insert_text',
                'splice_text',
            ]);
        });
    });

    describe('isFrontendTool', () => {
        it('应该识别已知的前端工具', () => {
            expect(isFrontendTool('get_document_content')).toBe(true);
            expect(isFrontendTool('splice_text')).toBe(true);
        });

        it('应该拒绝未知工具', () => {
            expect(isFrontendTool('unknown_tool')).toBe(false);
        });
    });
});
