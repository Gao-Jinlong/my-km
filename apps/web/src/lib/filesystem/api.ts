/**
 * File System API utilities
 */

import type { ProjectConfig } from '@/lib/types/project';

/**
 * 检查浏览器是否支持 File System API
 */
export function isFileSystemAPISupported(): boolean {
    return typeof window !== 'undefined' && 'showDirectoryPicker' in window;
}

/**
 * 打开文件夹选择器
 */
export async function openFolderPicker(): Promise<FileSystemDirectoryHandle | null> {
    if (!isFileSystemAPISupported()) {
        throw new Error('File System API is not supported');
    }

    try {
        const handle = await window.showDirectoryPicker?.();
        return handle ?? null;
    } catch (error: any) {
        if (error.name === 'AbortError') {
            // 用户取消
            return null;
        }
        throw error;
    }
}

/**
 * 读取项目配置文件
 */
export async function readProjectConfig(
    handle: FileSystemDirectoryHandle,
): Promise<ProjectConfig | null> {
    try {
        const myKmFolder = await handle.getDirectoryHandle('.my-km');
        const fileHandle = await myKmFolder.getFileHandle('project.json');
        const file = await fileHandle.getFile();
        const content = await file.text();
        return JSON.parse(content) as ProjectConfig;
    } catch (error) {
        console.error('Failed to read project config:', error);
        return null;
    }
}

/**
 * 检查文件夹是否包含 .my-km 目录
 */
export async function hasMyKmFolder(handle: FileSystemDirectoryHandle): Promise<boolean> {
    try {
        for await (const entry of handle.values()) {
            if (entry.name === '.my-km' && entry.kind === 'directory') {
                return true;
            }
        }
        return false;
    } catch {
        return false;
    }
}

/**
 * 创建默认项目配置
 */
export function createDefaultProjectConfig(name: string, description?: string): ProjectConfig {
    const now = new Date().toISOString();
    return {
        id: generateId(),
        name,
        description,
        version: '1.0.0',
        createdAt: now,
        updatedAt: now,
        lastOpenedAt: now,
        tags: [],
        status: 'active',
    };
}

/**
 * 生成简单的 ID（临时方案，后续使用 cuid）
 */
function generateId(): string {
    return Math.random().toString(36).substring(2) + Date.now().toString(36);
}
