/**
 * AutoSaveService - 自动保存服务
 *
 * 负责管理编辑器的自动保存功能，提供：
 * - 防抖保存逻辑
 * - 保存状态管理
 * - 与文件系统集成
 */

import type { FileSystemService } from '../../../platform/file-system/service';
import type { EditorService, SaveResult } from './EditorService';

/**
 * 保存状态枚举
 */
export enum SaveStatus {
    IDLE = 'idle',
    SAVING = 'saving',
    SAVED = 'saved',
    ERROR = 'error',
}

/**
 * 自动保存配置选项
 */
export interface AutoSaveOptions {
    /** 防抖时间，默认 500ms */
    debounceMs?: number;
    /** 最大等待时间，默认 5000ms */
    maxWaitMs?: number;
    /** 状态变化回调 */
    onStatusChange?: (status: SaveStatus, documentId?: string) => void;
    /** 错误处理回调 */
    onError?: (error: Error, documentId?: string) => void;
}

/**
 * 编辑器注册信息
 */
interface RegisteredEditor {
    editorService: EditorService;
    enabled: boolean;
    debounceTimer: ReturnType<typeof setTimeout> | null;
    maxWaitTimer: ReturnType<typeof setTimeout> | null;
    pendingSave: boolean;
    lastSaveTime: number;
}

/**
 * AutoSaveService 接口定义
 */
export interface AutoSaveService {
    /**
     * 注册编辑器
     * @param documentId 文档 ID
     * @param editorService 编辑器服务实例
     */
    register(documentId: string, editorService: EditorService): void;

    /**
     * 取消注册编辑器
     * @param documentId 文档 ID
     */
    unregister(documentId: string): void;

    /**
     * 触发保存（防抖）
     * @param documentId 文档 ID
     */
    triggerSave(documentId: string): void;

    /**
     * 立即保存
     * @param documentId 文档 ID
     * @returns 保存结果
     */
    saveNow(documentId: string): Promise<SaveResult>;

    /**
     * 启用自动保存
     * @param documentId 文档 ID
     */
    enable(documentId: string): void;

    /**
     * 禁用自动保存
     * @param documentId 文档 ID
     */
    disable(documentId: string): void;

    /**
     * 获取保存状态
     * @param documentId 文档 ID
     * @returns 保存状态
     */
    getStatus(documentId: string): SaveStatus;

    /**
     * 销毁服务
     */
    destroy(): void;
}

/**
 * 创建 AutoSaveService 的工厂函数
 *
 * @param fileSystemService 文件系统服务实例
 * @param options 自动保存配置选项
 * @returns AutoSaveService 实例
 */
export function createAutoSaveService(
    fileSystemService: FileSystemService,
    options?: AutoSaveOptions,
): AutoSaveService {
    const { debounceMs = 2000, maxWaitMs = 5000, onStatusChange, onError } = options ?? {};

    /** 已注册的编辑器映射表 */
    const editors = new Map<string, RegisteredEditor>();

    /** 每个编辑器的保存状态 */
    const statusMap = new Map<string, SaveStatus>();

    /** 文件系统服务实例 */
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const _fileService = fileSystemService;

    /**
     * 更新保存状态
     */
    function updateStatus(documentId: string, status: SaveStatus): void {
        statusMap.set(documentId, status);
        onStatusChange?.(status, documentId);
    }

    /**
     * 清除定时任务
     */
    function clearTimers(editor: RegisteredEditor): void {
        if (editor.debounceTimer) {
            clearTimeout(editor.debounceTimer);
            editor.debounceTimer = null;
        }
        if (editor.maxWaitTimer) {
            clearTimeout(editor.maxWaitTimer);
            editor.maxWaitTimer = null;
        }
    }

    /**
     * 执行实际保存
     */
    async function performSave(documentId: string, editor: RegisteredEditor): Promise<SaveResult> {
        // 如果已经在保存中，标记待保存
        if (statusMap.get(documentId) === SaveStatus.SAVING) {
            editor.pendingSave = true;
            return { success: false, error: 'Already saving' };
        }

        updateStatus(documentId, SaveStatus.SAVING);

        try {
            // 调用 EditorService 保存文档
            const result = await editor.editorService.saveDocument();

            if (result.success) {
                updateStatus(documentId, SaveStatus.SAVED);
                editor.lastSaveTime = Date.now();

                // 如果有待保存的请求，再次触发保存
                if (editor.pendingSave) {
                    editor.pendingSave = false;
                    // 使用微任务延迟，避免递归调用
                    Promise.resolve().then(() => {
                        if (editors.has(documentId)) {
                            triggerSave(documentId);
                        }
                    });
                }

                return result;
            } else {
                updateStatus(documentId, SaveStatus.ERROR);
                const error = new Error(result.error ?? 'Unknown save error');
                onError?.(error, documentId);
                return result;
            }
        } catch (error) {
            updateStatus(documentId, SaveStatus.ERROR);
            const err = error instanceof Error ? error : new Error('Failed to save document');
            onError?.(err, documentId);
            return {
                success: false,
                error: err.message,
            };
        } finally {
            // 保存完成后，延迟重置为 IDLE 状态
            setTimeout(() => {
                const currentStatus = statusMap.get(documentId);
                if (currentStatus === SaveStatus.SAVED || currentStatus === SaveStatus.ERROR) {
                    updateStatus(documentId, SaveStatus.IDLE);
                }
            }, 1000);
        }
    }

    /**
     * 防抖触发保存
     */
    function triggerSave(documentId: string): void {
        const editor = editors.get(documentId);

        if (!editor || !editor.enabled) {
            return;
        }

        // 清除之前的定时器
        clearTimers(editor);

        // 设置防抖定时器
        editor.debounceTimer = setTimeout(() => {
            performSave(documentId, editor);
        }, debounceMs);

        // 设置最大等待定时器
        editor.maxWaitTimer = setTimeout(() => {
            // 如果超过最大等待时间，立即保存
            if (editor.debounceTimer) {
                clearTimeout(editor.debounceTimer);
                editor.debounceTimer = null;
            }
            performSave(documentId, editor);
        }, maxWaitMs);

        editor.pendingSave = true;
    }

    /**
     * 立即保存
     */
    async function saveNow(documentId: string): Promise<SaveResult> {
        const editor = editors.get(documentId);

        if (!editor) {
            const error = new Error(`Editor not registered: ${documentId}`);
            onError?.(error, documentId);
            return { success: false, error: error.message };
        }

        // 清除待处理的定时器
        clearTimers(editor);

        // 重置待保存标志，避免重复触发
        editor.pendingSave = false;

        return performSave(documentId, editor);
    }

    return {
        register(documentId: string, editorService: EditorService): void {
            if (editors.has(documentId)) {
                console.warn(`Editor already registered: ${documentId}`);
                return;
            }

            editors.set(documentId, {
                editorService,
                enabled: true,
                debounceTimer: null,
                maxWaitTimer: null,
                pendingSave: false,
                lastSaveTime: 0,
            });

            updateStatus(documentId, SaveStatus.IDLE);
        },

        unregister(documentId: string): void {
            const editor = editors.get(documentId);

            if (editor) {
                // 清除定时器
                clearTimers(editor);

                // 如果正在保存，等待完成
                if (statusMap.get(documentId) === SaveStatus.SAVING) {
                    // 等待当前保存完成后再移除
                    setTimeout(() => {
                        editors.delete(documentId);
                        statusMap.delete(documentId);
                    }, 1000);
                } else {
                    editors.delete(documentId);
                    statusMap.delete(documentId);
                }
            }
        },

        triggerSave,

        saveNow,

        enable(documentId: string): void {
            const editor = editors.get(documentId);

            if (!editor) {
                console.warn(`Editor not found: ${documentId}`);
                return;
            }

            editor.enabled = true;
        },

        disable(documentId: string): void {
            const editor = editors.get(documentId);

            if (!editor) {
                console.warn(`Editor not found: ${documentId}`);
                return;
            }

            editor.enabled = false;
            clearTimers(editor);
        },

        getStatus(documentId: string): SaveStatus {
            return statusMap.get(documentId) ?? SaveStatus.IDLE;
        },

        destroy(): void {
            // 清理所有编辑器的定时器
            editors.forEach(editor => {
                clearTimers(editor);
            });

            // 清空映射表
            editors.clear();
            statusMap.clear();
        },
    };
}
