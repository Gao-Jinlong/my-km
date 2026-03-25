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
}

// 在模块级别获取服务实例，避免每次渲染都获取
const contextMenuService = container.get<ContextMenuService>(ContextMenuService);

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
    });

    React.useEffect(() => {
        // 监听菜单显示事件
        const unsubShown = contextMenuService.onMenuShown((ctx: ContextMenuContext) => {
            const groups =
                (ctx.data as { groups?: import('./types').ContextMenuGroup[] })?.groups || [];
            setMenuState({
                open: true,
                context: ctx,
                groups,
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
                    x={menuState.context.x}
                    y={menuState.context.y}
                    triggerElement={menuState.context.target}
                />
            )}
        </>
    );
}
