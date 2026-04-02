/**
 * ShortcutProvider - 快捷键提供者组件
 *
 * 在应用启动时注册全局快捷键
 */

'use client';

import { useEffect, useRef } from 'react';
import { container } from '@/platform/bootstrap';
import { EditorTabService } from '@/platform/editor-tab/service';
import { useEditorTabs } from '@/platform/editor-tab/use-editor-tabs';
import { EventBusService } from '@/platform/event-bus/service';
import { KeyboardShortcutService, KeyBinding, ShortcutScope } from '@/platform/keyboard';
import { ConditionId } from '@/platform/conditional';

/**
 * 文件搜索聚焦事件类型
 */
const FILE_SEARCH_FOCUS_EVENT = 'file-search.focus';

/**
 * 快捷键提供者组件
 */
export function ShortcutProvider({ children }: { children: React.ReactNode }) {
    const shortcutServiceRef = useRef<KeyboardShortcutService | null>(null);
    const { openDocuments, activeDocumentId, closeDocument } = useEditorTabs();

    useEffect(() => {
        // 获取快捷键服务实例
        const shortcutService = container.get(KeyboardShortcutService);
        const eventBus = container.get(EventBusService);
        shortcutServiceRef.current = shortcutService;

        // 注册默认快捷键
        const disposables = shortcutService.registerBatch([
            {
                keybinding: KeyBinding.CTRL_W,
                handler: {
                    handle: () => {
                        // 关闭当前活动文档
                        if (activeDocumentId) {
                            closeDocument(activeDocumentId);
                        }
                    },
                    description: '关闭当前标签页',
                },
                scope: ShortcutScope.GLOBAL,
            },
            {
                keybinding: KeyBinding.CTRL_S,
                handler: {
                    handle: () => {
                        // TODO: 触发保存当前文档
                        console.log('[Shortcut] Save triggered for:', activeDocumentId);
                        // 这里需要集成 AutoSaveService
                    },
                    description: '保存当前文档',
                },
                scope: ShortcutScope.EDITOR,
            },
            {
                keybinding: KeyBinding.CTRL_SHIFT_S,
                handler: {
                    handle: () => {
                        // TODO: 另存为功能
                        console.log('[Shortcut] Save As triggered for:', activeDocumentId);
                    },
                    description: '另存为',
                },
                scope: ShortcutScope.EDITOR,
            },
            {
                keybinding: KeyBinding.CTRL_P,
                handler: {
                    handle: () => {
                        // TODO: 快速打开文件
                        console.log('[Shortcut] Quick Open triggered');
                    },
                    description: '快速打开文件',
                },
                scope: ShortcutScope.GLOBAL,
            },
            {
                keybinding: KeyBinding.CTRL_SHIFT_P,
                handler: {
                    handle: () => {
                        // TODO: 打开命令面板
                        console.log('[Shortcut] Command Palette triggered');
                    },
                    description: '打开命令面板',
                },
                scope: ShortcutScope.GLOBAL,
            },
            {
                keybinding: KeyBinding.CTRL_TAB,
                handler: {
                    handle: () => {
                        // 切换到下一个标签页
                        const currentIndex = openDocuments.findIndex(
                            d => d.id === activeDocumentId,
                        );
                        if (currentIndex !== -1 && openDocuments.length > 1) {
                            const nextIndex = (currentIndex + 1) % openDocuments.length;
                            const nextDoc = openDocuments[nextIndex];
                            if (nextDoc) {
                                // 激活下一个文档
                                const tabService = container.get(EditorTabService);
                                tabService.activateDocument(nextDoc.id);
                            }
                        }
                    },
                    description: '切换到下一个标签页',
                },
                scope: ShortcutScope.EDITOR,
            },
            {
                keybinding: KeyBinding.CTRL_SHIFT_TAB,
                handler: {
                    handle: () => {
                        // 切换到上一个标签页
                        const currentIndex = openDocuments.findIndex(
                            d => d.id === activeDocumentId,
                        );
                        if (currentIndex !== -1 && openDocuments.length > 1) {
                            const prevIndex =
                                (currentIndex - 1 + openDocuments.length) % openDocuments.length;
                            const prevDoc = openDocuments[prevIndex];
                            if (prevDoc) {
                                // 激活上一个文档
                                const tabService = container.get(EditorTabService);
                                tabService.activateDocument(prevDoc.id);
                            }
                        }
                    },
                    description: '切换到上一个标签页',
                },
                scope: ShortcutScope.EDITOR,
            },
            {
                keybinding: KeyBinding.CTRL_F,
                handler: {
                    handle: () => {
                        // 触发文件搜索聚焦事件
                        eventBus.publish({
                            type: FILE_SEARCH_FOCUS_EVENT,
                            source: 'shortcut-provider',
                            payload: undefined,
                        });
                    },
                    description: '搜索文件',
                    condition: ConditionId.IS_FILE_PANEL_ACTIVE,
                },
                scope: ShortcutScope.FILE_TREE,
            },
        ]);

        // 清理函数
        return () => {
            disposables.dispose();
        };
    }, [activeDocumentId, closeDocument, openDocuments]);

    return <>{children}</>;
}
