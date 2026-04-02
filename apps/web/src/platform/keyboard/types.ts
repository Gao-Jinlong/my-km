/**
 * 键盘快捷键类型定义
 */

/**
 * 修饰键枚举
 */
export enum ModifierKey {
    CTRL = 'ctrl',
    SHIFT = 'shift',
    ALT = 'alt',
    META = 'meta',
}

/**
 * 普通键枚举
 */
export enum Key {
    // 字母键
    A = 'a',
    B = 'b',
    C = 'c',
    D = 'd',
    E = 'e',
    F = 'f',
    G = 'g',
    H = 'h',
    I = 'i',
    J = 'j',
    K = 'k',
    L = 'l',
    M = 'm',
    N = 'n',
    O = 'o',
    P = 'p',
    Q = 'q',
    R = 'r',
    S = 's',
    T = 't',
    U = 'u',
    V = 'v',
    W = 'w',
    X = 'x',
    Y = 'y',
    Z = 'z',
    // 数字键
    N0 = '0',
    N1 = '1',
    N2 = '2',
    N3 = '3',
    N4 = '4',
    N5 = '5',
    N6 = '6',
    N7 = '7',
    N8 = '8',
    N9 = '9',
    // 功能键
    F1 = 'f1',
    F2 = 'f2',
    F3 = 'f3',
    F4 = 'f4',
    F5 = 'f5',
    F6 = 'f6',
    F7 = 'f7',
    F8 = 'f8',
    F9 = 'f9',
    F10 = 'f10',
    F11 = 'f11',
    F12 = 'f12',
    // 特殊键
    SPACE = 'space',
    ESCAPE = 'escape',
    BACKSPACE = 'backspace',
    DELETE = 'delete',
    TAB = 'tab',
    ENTER = 'enter',
    // 方向键
    UP = 'up',
    DOWN = 'down',
    LEFT = 'left',
    RIGHT = 'right',
}

/**
 * 快捷键作用域枚举
 */
export enum ShortcutScope {
    /** 全局作用域，始终可用 */
    GLOBAL = 'global',
    /** 编辑器作用域，仅在编辑器激活时可用 */
    EDITOR = 'editor',
    /** 文件树作用域，仅在文件面板激活时可用 */
    FILE_TREE = 'file-tree',
}

/**
 * 预定义快捷键枚举
 *
 * 使用方式：
 * - KeyBinding.CTRL_S -> 'ctrl+s'
 * - KeyBinding.CTRL_SHIFT_P -> 'ctrl+shift+p'
 */
export enum KeyBinding {
    // 文件操作
    CTRL_S = 'ctrl+s',
    CTRL_SHIFT_S = 'ctrl+shift+s',
    CTRL_W = 'ctrl+w',
    CTRL_P = 'ctrl+p',
    CTRL_SHIFT_P = 'ctrl+shift+p',
    // 标签页切换
    CTRL_TAB = 'ctrl+tab',
    CTRL_SHIFT_TAB = 'ctrl+shift+tab',
    // 搜索
    CTRL_F = 'ctrl+f',
    // 通用
    CTRL_Z = 'ctrl+z',
    CTRL_Y = 'ctrl+y',
    CTRL_A = 'ctrl+a',
    CTRL_C = 'ctrl+c',
    CTRL_V = 'ctrl+v',
    CTRL_X = 'ctrl+x',
}

/**
 * 快捷键配置
 */
export interface ShortcutConfig {
    /** 快捷键组合，使用 KeyBinding 枚举 */
    keybinding: KeyBinding | string;
    /** 处理函数 */
    handler: ShortcutHandler;
    /** 作用域 */
    scope?: ShortcutScope | string;
}

/**
 * 快捷键处理器接口
 */
export interface ShortcutHandler {
    /** 处理函数 */
    handle: () => void | Promise<void>;
    /** 描述 */
    description?: string;
    /** 条件 ID（可选），用于判断快捷键是否应该执行 */
    condition?: string;
}
