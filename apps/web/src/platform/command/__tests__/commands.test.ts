import { describe, expect, it } from 'vitest';
import { EditorCommands, FileCommands, ViewCommands } from '../commands';

describe('CommandCenter Commands', () => {
    it('应正确定义文件命令', () => {
        expect(FileCommands.SAVE_FILE).toBe('file.save');
        expect(FileCommands.DELETE_FILE).toBe('file.delete');
    });

    it('应正确定义编辑器命令', () => {
        expect(EditorCommands.UNDO).toBe('editor.undo');
        expect(EditorCommands.REDO).toBe('editor.redo');
    });

    it('应正确定义视图命令', () => {
        expect(ViewCommands.TOGGLE_SIDEBAR).toBe('view.toggleSidebar');
        expect(ViewCommands.ZOOM_IN).toBe('view.zoomIn');
    });
});
