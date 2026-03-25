/**
 * 右键菜单服务类型定义
 */

import type { ReactNode } from 'react';

/**
 * 右键菜单项
 */
export interface ContextMenuItem {
    /** 唯一标识 */
    id: string;
    /** 显示文本 */
    label: string;
    /** 图标组件 */
    icon?: ReactNode | ((props: { className?: string }) => ReactNode);
    /** 执行动作 */
    action: () => void | Promise<void>;
    /** 是否禁用 */
    disabled?: boolean;
    /** 是否隐藏 */
    hidden?: boolean;
    /** 快捷键提示 */
    shortcut?: string;
    /** 子菜单 */
    children?: ContextMenuItem[];
}

/**
 * 右键菜单分隔符
 */
export interface ContextMenuSeparator {
    id: string;
    type: 'separator';
}

/**
 * 右键菜单项或分隔符
 */
export type ContextMenuEntry = ContextMenuItem | ContextMenuSeparator;

/**
 * 右键菜单组
 */
export interface ContextMenuGroup {
    /** 组 ID */
    id: string;
    /** 组内项目 */
    entries: ContextMenuEntry[];
    /** 分隔符位置 */
    separator?: 'before' | 'after' | 'both';
}

/**
 * 右键菜单上下文
 */
export interface ContextMenuContext {
    /** 触发元素 */
    target: HTMLElement;
    /** 触发节点（如文件树节点） */
    targetNode?: Node;
    /** 上下文数据（由提供者填充） */
    data?: Record<string, unknown>;
    /** 鼠标事件 X 坐标 */
    x: number;
    /** 鼠标事件 Y 坐标 */
    y: number;
}

/**
 * 右键菜单提供者函数
 *
 * @param context 菜单上下文
 * @returns 菜单组数组
 */
export type ContextMenuProvider = (
    context: ContextMenuContext,
) => ContextMenuGroup[] | Promise<ContextMenuGroup[]>;
