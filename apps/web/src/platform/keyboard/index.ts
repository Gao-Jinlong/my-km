/**
 * 键盘快捷键模块导出
 */

export type { ShortcutHandler } from './shortcut.service';
export { KeyboardShortcutService } from './shortcut.service';

// 导出枚举类型和配置
export { ModifierKey, Key, ShortcutScope, KeyBinding } from './types';
export type { ShortcutConfig, ShortcutHandler as KeyboardShortcutHandler } from './types';
