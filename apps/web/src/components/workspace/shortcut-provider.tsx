/**
 * ShortcutProvider - 快捷键提供者组件
 *
 * 在应用启动时注册全局快捷键
 * Handler 从服务层读取状态（非闭包），只注册一次
 */

'use client';

import { useEffect, useRef } from 'react';
import { container } from '@/platform/bootstrap';
import { ConditionId } from '@/platform/conditional';
import { EditorContainer } from '@/platform/editor/container/editor-container';
import { EditorTabService } from '@/platform/editor-tab/service';
import { EventBusService } from '@/platform/event-bus/service';
import { KeyBinding, KeyboardShortcutService, ShortcutScope } from '@/platform/keyboard';
import { LoggerService } from '@/platform/logger/service';

const logger = container.get(LoggerService).getLogger('shortcut');

/**
 * 文件搜索聚焦事件类型
 */
const FILE_SEARCH_FOCUS_EVENT = 'file-search.focus';

/**
 * 快捷键提供者组件
 */
export function ShortcutProvider({ children }: { children: React.ReactNode }) {
    const shortcutServiceRef = useRef<KeyboardShortcutService | null>(null);

    useEffect(() => {
        // 获取快捷键服务实例
        const shortcutService = container.get(KeyboardShortcutService);
        const eventBus = container.get(EventBusService);
        shortcutServiceRef.current = shortcutService;

        // 注册默认快捷键（只注册一次，handler 从服务读取状态）
        const disposables = shortcutService.registerBatch([
            {
                keybinding: KeyBinding.CTRL_W,
                handler: {
                    handle: () => {
                        // 关闭当前活动文档
                        const tabService = container.get(EditorTabService);
                        const activeId = tabService.getActiveDocumentId();
                        if (activeId) {
                            tabService.closeDocument(activeId);
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
                        const tabService = container.get(EditorTabService);
                        const activeId = tabService.getActiveDocumentId();
                        if (activeId) {
                            const editorContainer = container.get(EditorContainer);
                            const editorService = editorContainer.getService(activeId);
                            if (editorService) {
                                editorService
                                    .saveDocument()
                                    .catch(err => logger.error('保存文档失败:', err));
                            }
                        }
                    },
                    description: '保存当前文档',
                    condition: ConditionId.IS_EDITOR_ACTIVE,
                },
                scope: ShortcutScope.EDITOR,
            },
            {
                keybinding: KeyBinding.CTRL_SHIFT_S,
                handler: {
                    handle: () => {
                        // TODO: 另存为功能
                        const tabService = container.get(EditorTabService);
                        logger.debug(
                            '[Shortcut] Save As triggered for:',
                            tabService.getActiveDocumentId(),
                        );
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
                        logger.debug('[Shortcut] Quick Open triggered');
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
                        logger.debug('[Shortcut] Command Palette triggered');
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
                        const tabService = container.get(EditorTabService);
                        const docs = tabService.getOpenDocuments();
                        const activeId = tabService.getActiveDocumentId();
                        const currentIndex = docs.findIndex(d => d.id === activeId);
                        if (currentIndex !== -1 && docs.length > 1) {
                            const nextIndex = (currentIndex + 1) % docs.length;
                            const nextDoc = docs[nextIndex];
                            if (nextDoc) {
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
                        const tabService = container.get(EditorTabService);
                        const docs = tabService.getOpenDocuments();
                        const activeId = tabService.getActiveDocumentId();
                        const currentIndex = docs.findIndex(d => d.id === activeId);
                        if (currentIndex !== -1 && docs.length > 1) {
                            const prevIndex = (currentIndex - 1 + docs.length) % docs.length;
                            const prevDoc = docs[prevIndex];
                            if (prevDoc) {
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
    }, []);

    return <>{children}</>;
}
