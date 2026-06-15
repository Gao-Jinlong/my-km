import { FRONTEND_TOOLS, frontendTools, isFrontendTool } from '../tool-definitions';

describe('tool-definitions', () => {
    describe('FRONTEND_TOOLS', () => {
        it('应该包含 4 个工具名', () => {
            expect(FRONTEND_TOOLS.size).toBe(4);
            expect(FRONTEND_TOOLS.has('file_ops')).toBe(true);
            expect(FRONTEND_TOOLS.has('doc_read')).toBe(true);
            expect(FRONTEND_TOOLS.has('doc_edit')).toBe(true);
            expect(FRONTEND_TOOLS.has('search')).toBe(true);
        });
    });

    describe('frontendTools', () => {
        it('应该包含 4 个 LangChain Tool 实例', () => {
            expect(frontendTools.length).toBe(4);
            const names = frontendTools.map(t => t.name).sort();
            expect(names).toEqual(['doc_edit', 'doc_read', 'file_ops', 'search']);
        });
    });

    describe('isFrontendTool', () => {
        it('应该识别已知的前端工具', () => {
            expect(isFrontendTool('file_ops')).toBe(true);
            expect(isFrontendTool('doc_edit')).toBe(true);
        });

        it('应该拒绝未知工具', () => {
            expect(isFrontendTool('unknown_tool')).toBe(false);
        });
    });
});
