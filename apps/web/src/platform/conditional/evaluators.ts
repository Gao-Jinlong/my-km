/**
 * 条件评估器注册
 *
 * 在应用启动时注册所有条件评估器
 */

import { container } from '@/platform/bootstrap';
import { ConditionalService } from '@/platform/conditional/service';
import { ConditionId } from '@/platform/conditional/types';
import { EditorTabService } from '@/platform/editor-tab/service';
import { PanelService } from '@/platform/panel/service';

/**
 * 注册所有条件评估器
 *
 * 在应用启动时调用一次
 */
export function registerConditionEvaluators(): void {
    const conditionalService = container.get(ConditionalService);
    const panelService = container.get(PanelService);
    const editorTabService = container.get(EditorTabService);

    conditionalService.registerBatch([
        {
            id: ConditionId.IS_FILE_PANEL_ACTIVE,
            description: '文件面板处于激活且展开状态',
            evaluate: () => {
                // 检查文件面板是否展开且可见
                return panelService.isVisible('files-panel');
            },
        },
        {
            id: ConditionId.IS_SEARCH_PANEL_ACTIVE,
            description: '搜索面板处于激活且展开状态',
            evaluate: () => {
                return panelService.isVisible('search-panel');
            },
        },
        {
            id: ConditionId.IS_EDITOR_ACTIVE,
            description: '编辑器有激活的文档',
            evaluate: () => {
                const ctx = conditionalService.getContext();
                return ctx.activeDocumentId !== null && ctx.activeDocumentId !== undefined;
            },
        },
        {
            id: ConditionId.IS_IN_INPUT,
            description: '焦点在输入元素中',
            evaluate: () => {
                const ctx = conditionalService.getContext();
                return ctx.isInInput === true;
            },
        },
    ]);

    // 监听面板状态变化，更新上下文
    panelService.onDidChangePanel(state => {
        conditionalService.updateContext({
            activePanelId: state.expanded && state.size > 0 ? state.id : null,
        });
    });

    // 监听编辑器激活状态变化，更新上下文
    editorTabService.onDidChangeActive(documentId => {
        conditionalService.updateContext({
            activeDocumentId: documentId,
        });
    });

    // 监听焦点变化，更新上下文
    if (typeof document !== 'undefined') {
        document.addEventListener(
            'focusin',
            () => {
                const el = document.activeElement;
                const tagName = el?.tagName?.toLowerCase();
                const isInInput =
                    tagName === 'input' ||
                    tagName === 'textarea' ||
                    el?.getAttribute('role') === 'textbox';

                conditionalService.updateContext({
                    focusElementTagName: tagName,
                    isInInput,
                });
            },
            true,
        );
    }
}
