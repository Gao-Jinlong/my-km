/**
 * 右键菜单提供者组件
 *
 * 监听 ContextMenuService 的事件，自动显示/隐藏菜单
 */

'use client';

import * as React from 'react';
import { container } from '../bootstrap';
import { ContextMenu } from './context-menu';
import { ContextMenuService } from './service';
import type { ContextMenuContext } from './types';

interface ContextMenuProviderProps {
    children: React.ReactNode;
}

interface MenuState {
    open: boolean;
    context: ContextMenuContext | null;
    groups: import('./types').ContextMenuGroup[];
    position: { x: number; y: number };
}

// 在模块级别获取服务实例，避免每次渲染都获取
const contextMenuService = container.get<ContextMenuService>(ContextMenuService);

/**
 * 计算菜单位置（带边界检测）
 */
function calculateMenuPosition(
    x: number,
    y: number,
    menuWidth: number = 220,
    menuHeight: number = 300,
): { x: number; y: number } {
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let posX = x;
    let posY = y;

    // X 轴边界检测
    if (posX + menuWidth > viewportWidth) {
        posX = viewportWidth - menuWidth - 8;
    }
    if (posX < 8) {
        posX = 8;
    }

    // Y 轴边界检测
    if (posY + menuHeight > viewportHeight) {
        posY = viewportHeight - menuHeight - 8;
    }
    if (posY < 8) {
        posY = 8;
    }

    return { x: posX, y: posY };
}

/**
 * 右键菜单提供者 - 应用根组件级别
 *
 * @example
 * ```tsx
 * // app/layout.tsx
 * import { ContextMenuProvider } from '@/platform/context-menu';
 *
 * export default function RootLayout({ children }) {
 *     return (
 *         <html>
 *             <body>
 *                 <ContextMenuProvider>
 *                     {children}
 *                 </ContextMenuProvider>
 *             </body>
 *         </html>
 *     );
 * }
 * ```
 */
export function ContextMenuProvider({ children }: ContextMenuProviderProps) {
    const [menuState, setMenuState] = React.useState<MenuState>({
        open: false,
        context: null,
        groups: [],
        position: { x: 0, y: 0 },
    });

    React.useEffect(() => {
        // 监听菜单显示事件
        const unsubShown = contextMenuService.onMenuShown((ctx: ContextMenuContext) => {
            const groups =
                (ctx.data as { groups?: import('./types').ContextMenuGroup[] })?.groups || [];

            // 计算菜单位置（带边界检测）
            const calculatedPos = calculateMenuPosition(ctx.x, ctx.y);

            setMenuState({
                open: true,
                context: ctx,
                groups,
                position: calculatedPos,
            });
        });

        // 监听菜单关闭事件
        const unsubDismissed = contextMenuService.onMenuDismissed(() => {
            setMenuState(prev => ({ ...prev, open: false }));
        });

        return () => {
            unsubShown.dispose();
            unsubDismissed.dispose();
        };
    }, []);

    const handleOpenChange = React.useCallback((open: boolean) => {
        if (!open) {
            contextMenuService.dismiss();
        }
        setMenuState(prev => ({ ...prev, open }));
    }, []);

    return (
        <>
            {children}
            {menuState.context && (
                <ContextMenu
                    open={menuState.open}
                    onOpenChange={handleOpenChange}
                    groups={menuState.groups}
                    x={menuState.position.x}
                    y={menuState.position.y}
                    triggerElement={menuState.context.target}
                />
            )}
        </>
    );
}
