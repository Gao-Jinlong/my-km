import { Disposable } from '../../../base/common/lifecycle';
import { dbClear, dbDelete, dbGet, dbGetAllKeys, dbHas, dbSet } from '../db/idb';
import type { FileHandleKey, FileSystemHandle } from '../types';

/**
 * IndexedDB 存储名称
 */
const STORE_NAME = 'fileHandles';

/**
 * 文件句柄缓存类
 * 负责将 FileSystemHandle 存储到 IndexedDB 并支持检索
 *
 * 继承自 Disposable，支持资源清理
 */
export class FileHandleCache extends Disposable {
    /**
     * 存储文件句柄到 IndexedDB
     * @param key - 存储键值
     * @param handle - 文件句柄
     */
    async storeHandle(key: FileHandleKey, handle: FileSystemHandle): Promise<void> {
        await dbSet(STORE_NAME, {
            key,
            handle,
            timestamp: Date.now(),
        });
    }

    /**
     * 从 IndexedDB 检索文件句柄
     * @param key - 存储键值
     * @returns 文件句柄，如果不存在则返回 null
     */
    async getHandle(key: FileHandleKey): Promise<FileSystemHandle | null> {
        const result = await dbGet<{
            key: FileHandleKey;
            handle: FileSystemHandle;
            timestamp: number;
        }>(STORE_NAME, key);

        if (!result) {
            return null;
        }

        return result.handle;
    }

    /**
     * 从 IndexedDB 删除文件句柄
     * @param key - 存储键值
     */
    async deleteHandle(key: FileHandleKey): Promise<void> {
        await dbDelete(STORE_NAME, key);
    }

    /**
     * 批量删除项目相关的所有句柄
     * @param projectId - 项目 ID
     */
    async clearProject(projectId: string): Promise<void> {
        const keys = await dbGetAllKeys(STORE_NAME);

        // 删除所有以 projectId 开头的键
        const deletePromises = keys
            .filter(key => {
                const keyStr = typeof key === 'string' ? key : String(key);
                return keyStr.startsWith(`${projectId}:`) || keyStr === projectId;
            })
            .map(key => dbDelete(STORE_NAME, key));

        await Promise.all(deletePromises);
    }

    /**
     * 验证文件句柄是否仍然有效
     * @param handle - 待验证的文件句柄
     * @returns 句柄是否有效
     */
    async verifyHandle(handle: FileSystemHandle | null): Promise<boolean> {
        if (!handle) {
            return false;
        }

        try {
            // 通过查询句柄的 kind 属性验证其有效性
            const kind = handle.kind;
            return kind === 'file' || kind === 'directory';
        } catch {
            // 如果访问句柄属性抛出错误，说明句柄已失效
            return false;
        }
    }

    /**
     * 验证指定 key 的句柄是否存在且有效
     * @param key - 存储键值
     * @returns 句柄是否存在且有效
     */
    async verifyHandleByKey(key: FileHandleKey): Promise<boolean> {
        const handle = await this.getHandle(key);
        return this.verifyHandle(handle);
    }

    /**
     * 检查指定 key 的句柄是否存在
     * @param key - 存储键值
     * @returns 句柄是否存在
     */
    async hasHandle(key: FileHandleKey): Promise<boolean> {
        return dbHas(STORE_NAME, key);
    }

    /**
     * 获取所有缓存的句柄键值
     * @returns 所有键值列表
     */
    async getAllKeys(): Promise<FileHandleKey[]> {
        const keys = await dbGetAllKeys(STORE_NAME);
        return keys.map(key => String(key));
    }

    /**
     * 清空所有缓存的句柄
     */
    async clearAll(): Promise<void> {
        await dbClear(STORE_NAME);
    }

    /**
     * 释放资源
     * 清理缓存引用
     */
    override dispose(): void {
        // IndexedDB 中的数据是持久化的，不需要清理
        // 这里只做引用清理
        super.dispose();
    }
}
