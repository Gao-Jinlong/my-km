/**
 * DocumentStatusIndicator - 文档状态指示器组件
 *
 * 显示文档的当前状态（只读、编辑未保存、已保存、保存中等）
 */

'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { useEditorTabs } from '@/platform/editor-tab/use-editor-tabs';

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
    const { openDocuments } = useEditorTabs();
    const openDoc = openDocuments.find(d => d.id === documentId);

    // 从标签获取状态
    const isDirty = openDoc?.isDirty ?? false;

    // 从 EditorService 获取实时状态
    const [isReadonly, setIsReadonly] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [isSaved, setIsSaved] = useState(false);
    const [hasError, setHasError] = useState(false);

    useEffect(() => {
        const editorService = editorServiceMap.get(documentId);

        if (!editorService) {
            return;
        }

        // 订阅状态变化事件
        const unsubscribe = editorService.onChange(
            (state: {
                isReadonly: boolean;
                isSaving: boolean;
                isSaved: boolean;
                hasError: boolean;
            }) => {
                setIsReadonly(state.isReadonly);
                setIsSaving(state.isSaving);
                setIsSaved(state.isSaved);
                setHasError(state.hasError);
            },
        );

        // 初始同步一次
        const initialState = editorService.getState();
        setIsReadonly(initialState.isReadonly);
        setIsSaving(initialState.isSaving);
        setIsSaved(initialState.isSaved);
        setHasError(initialState.hasError);

        return () => {
            unsubscribe();
        };
    }, [documentId]);

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

// 简单的服务实例映射（用于获取 EditorService 状态）
// biome-ignore lint/suspicious/noExplicitAny: 需要存储不同类型的 EditorService
const editorServiceMap = new Map<string, any>();

/**
 * 注册 EditorService 实例用于状态监听
 */
// biome-ignore lint/suspicious/noExplicitAny: 需要接受不同类型的 EditorService
export function registerEditorService(documentId: string, service: any): void {
    editorServiceMap.set(documentId, service);
}

/**
 * 注销 EditorService 实例
 */
export function unregisterEditorService(documentId: string): void {
    editorServiceMap.delete(documentId);
}
