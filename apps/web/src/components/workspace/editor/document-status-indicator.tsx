/**
 * DocumentStatusIndicator - 文档状态指示器组件
 *
 * 显示文档的当前状态（只读、编辑未保存、已保存、保存中等）
 * 所有状态统一从 EditorService 获取
 */

'use client';

import { cn } from '@/lib/utils';
import { useEditorServiceState } from '@/platform/editor/use-editor-service-state';

interface DocumentStatusIndicatorProps {
    documentId: string;
    className?: string;
}

/**
 * 获取状态的显示文本和样式
 */
function getStatusDisplay(
    isDirty: boolean,
    isReadonly: boolean,
    isSaving: boolean,
    isSaved: boolean,
    hasError: boolean,
): {
    text: string;
    className: string;
    icon: string;
} {
    if (hasError) {
        return {
            text: '保存失败',
            className: 'text-red-600 bg-red-50',
            icon: '●',
        };
    }

    if (isSaving) {
        return {
            text: '保存中...',
            className: 'text-blue-600 bg-blue-50 animate-pulse',
            icon: '⟳',
        };
    }

    if (isSaved) {
        return {
            text: '已保存',
            className: 'text-green-600 bg-green-50',
            icon: '✓',
        };
    }

    if (isReadonly) {
        return {
            text: '只读',
            className: 'text-amber-600 bg-amber-50',
            icon: '🔒',
        };
    }

    if (isDirty) {
        return {
            text: '未保存',
            className: 'text-orange-600 bg-orange-50',
            icon: '●',
        };
    }

    return {
        text: '',
        className: 'text-ws-fg-placeholder',
        icon: '',
    };
}

export function DocumentStatusIndicator({ documentId, className }: DocumentStatusIndicatorProps) {
    const state = useEditorServiceState(documentId);

    const isDirty = state?.isDirty ?? false;
    const isReadonly = state?.isReadonly ?? false;
    const isSaving = state?.isSaving ?? false;
    const isSaved = state?.isSaved ?? false;
    const hasError = state?.hasError ?? false;

    const status = getStatusDisplay(isDirty, isReadonly, isSaving, isSaved, hasError);

    if (!status.text) return null;

    return (
        <div
            className={cn(
                'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-medium text-xs transition-opacity',
                status.className,
                className,
            )}
            title={isDirty ? '文档已修改但尚未保存' : status.text}
        >
            <span className="text-xs">{status.icon}</span>
            <span>{status.text}</span>
        </div>
    );
}
