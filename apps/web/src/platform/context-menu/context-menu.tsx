/**
 * 右键菜单 UI 组件
 *
 * 使用绝对定位在鼠标点击位置显示菜单
 * 使用原生 HTML 实现
 */

'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import type { ContextMenuGroup, ContextMenuItem } from '@/platform/context-menu/types';

export interface ContextMenuProps {
    /** 是否打开 */
    open?: boolean;
    /** 打开状态变化回调 */
    onOpenChange?: (open: boolean) => void;
    /** 菜单组 */
    groups: ContextMenuGroup[];
    /** X 坐标（已计算好的位置） */
    x: number;
    /** Y 坐标（已计算好的位置） */
    y?: number;
    /** 触发元素 */
    triggerElement?: HTMLElement | null;
}

/**
 * 右键菜单组件 - 使用绝对定位
 */
export function ContextMenu({ open, onOpenChange, groups, x, y }: ContextMenuProps) {
    // 菜单容器 ref，用于获取尺寸以进行边界检测
    const menuRef = React.useRef<HTMLDivElement>(null);

    // 注意：位置计算已由 ContextMenuProvider 处理
    // x, y 参数现在是已计算好的最终位置，直接使用即可

    // 点击菜单外部时关闭菜单
    React.useEffect(() => {
        if (!open) return;

        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                onOpenChange?.(false);
            }
        };

        const handleEscape = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                onOpenChange?.(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        document.addEventListener('keydown', handleEscape);

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            document.removeEventListener('keydown', handleEscape);
        };
    }, [open, onOpenChange]);

    // 阻止右键点击事件冒泡
    const handleContextMenu = React.useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
    }, []);

    if (!open) {
        return null;
    }

    return (
        <div
            ref={menuRef}
            className={cn(
                'fixed z-50 min-w-55 overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md',
            )}
            style={{
                left: `${x}px`,
                top: `${y}px`,
            }}
            onContextMenu={handleContextMenu}
            role="menu"
        >
            {groups.map(group => (
                <React.Fragment key={group.id}>
                    {group.separator === 'before' && <div className="-mx-1 my-1 h-px bg-border" />}

                    <div>
                        {group.entries.map(entry => {
                            if ('type' in entry && entry.type === 'separator') {
                                return <div key={entry.id} className="-mx-1 my-1 h-px bg-border" />;
                            }

                            const item = entry as ContextMenuItem;

                            if (item.children && item.children.length > 0) {
                                // 子菜单 - 简化版本，暂时不处理
                                return (
                                    <div
                                        key={item.id}
                                        className="flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none focus:bg-accent"
                                        role="menuitem"
                                        tabIndex={-1}
                                    >
                                        {item.icon && (
                                            <span className="mr-2 h-4 w-4">
                                                {typeof item.icon === 'function'
                                                    ? item.icon({ className: 'h-4 w-4' })
                                                    : item.icon}
                                            </span>
                                        )}
                                        {item.label}
                                        <span className="ml-auto text-xs">▶</span>
                                    </div>
                                );
                            }

                            return (
                                <div
                                    key={item.id}
                                    className="flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none focus:bg-accent"
                                    onClick={e => {
                                        e.stopPropagation();
                                        item.action?.();
                                        onOpenChange?.(false);
                                    }}
                                    onKeyDown={e => {
                                        if (e.key === 'Enter' || e.key === ' ') {
                                            e.preventDefault();
                                            item.action?.();
                                            onOpenChange?.(false);
                                        }
                                    }}
                                    role="menuitem"
                                    tabIndex={-1}
                                >
                                    {item.icon && (
                                        <span className="mr-2 h-4 w-4">
                                            {typeof item.icon === 'function'
                                                ? item.icon({ className: 'h-4 w-4' })
                                                : item.icon}
                                        </span>
                                    )}
                                    {item.label}
                                    {item.shortcut && (
                                        <span className="ml-auto text-muted-foreground text-xs tracking-widest">
                                            {item.shortcut}
                                        </span>
                                    )}
                                </div>
                            );
                        })}
                    </div>

                    {group.separator === 'after' && <div className="-mx-1 my-1 h-px bg-border" />}
                </React.Fragment>
            ))}
        </div>
    );
}
