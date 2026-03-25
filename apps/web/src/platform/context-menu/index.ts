/**
 * 右键菜单模块
 *
 * 系统级右键菜单服务，支持多模块注册菜单提供者
 *
 * @example
 * ```typescript
 * // 注册提供者
 * const { contextMenuService } = await import('@/platform/context-menu');
 *
 * contextMenuService.registerProvider('fileTree', (ctx) => {
 *     return [{
 *         id: 'file-actions',
 *         entries: [
 *             { id: 'open', label: '打开', action: () => {} },
 *             { id: 'sep', type: 'separator' },
 *             { id: 'delete', label: '删除', action: () => {} },
 *         ],
 *     }];
 * });
 * ```
 */

export { ContextMenu } from './context-menu';
export { ContextMenuProvider } from './context-menu-provider';
export { ContextMenuService } from './service';

// 导出类型
export type {
    ContextMenuContext,
    ContextMenuEntry,
    ContextMenuGroup,
    ContextMenuItem,
    ContextMenuProvider as IContextMenuProvider,
    ContextMenuSeparator,
} from './types';
