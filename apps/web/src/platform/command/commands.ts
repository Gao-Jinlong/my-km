/**
 * 文件相关命令
 */
export namespace FileCommands {
    export const OPEN_FILE = 'file.open';
    export const SAVE_FILE = 'file.save';
    export const SAVE_ALL = 'file.saveAll';
    export const CLOSE_FILE = 'file.close';
    export const DELETE_FILE = 'file.delete';
    export const RENAME_FILE = 'file.rename';
}

/**
 * 编辑器相关命令
 */
export namespace EditorCommands {
    export const UNDO = 'editor.undo';
    export const REDO = 'editor.redo';
    export const CUT = 'editor.cut';
    export const COPY = 'editor.copy';
    export const PASTE = 'editor.paste';
    export const SELECT_ALL = 'editor.selectAll';
    export const FIND = 'editor.find';
    export const REPLACE = 'editor.replace';
}

/**
 * 视图相关命令
 */
export namespace ViewCommands {
    export const TOGGLE_SIDEBAR = 'view.toggleSidebar';
    export const TOGGLE_PANEL = 'view.togglePanel';
    export const ZOOM_IN = 'view.zoomIn';
    export const ZOOM_OUT = 'view.zoomOut';
    export const RESET_ZOOM = 'view.resetZoom';
}
