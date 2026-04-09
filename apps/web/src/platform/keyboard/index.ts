/**
 * 键盘快捷键模块导出
 */

export type { ShortcutHandler } from './shortcut.service';
export { KeyboardShortcutService } from './shortcut.service';
export type { ShortcutConfig, ShortcutHandler as KeyboardShortcutHandler } from './types';
// 导出枚举类型和配置
export { Key, KeyBinding, ModifierKey, ShortcutScope } from './types';
