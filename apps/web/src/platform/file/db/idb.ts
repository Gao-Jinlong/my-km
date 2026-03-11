/**
 * IndexedDB 工具类
 * 提供 Promise 封装的 IndexedDB 操作方法
 */

/**
 * 数据库配置
 */
const DB_CONFIG = {
    name: 'FileSystemDB',
    version: 1,
    stores: {
        fileHandles: 'fileHandles',
    },
} as const;

/**
 * 打开数据库连接
 */
export function openDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_CONFIG.name, DB_CONFIG.version);

        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);

        request.onupgradeneeded = event => {
            const db = (event.target as IDBOpenDBRequest).result;

            // 创建文件句柄存储
            if (!db.objectStoreNames.contains(DB_CONFIG.stores.fileHandles)) {
                const store = db.createObjectStore(DB_CONFIG.stores.fileHandles, {
                    keyPath: 'key',
                });
                store.createIndex('timestamp', 'timestamp', { unique: false });
            }
        };
    });
}

/**
 * 从 IndexedDB 获取数据
 */
export async function dbGet<T>(storeName: string, key: IDBValidKey): Promise<T | null> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(storeName, 'readonly');
        const store = transaction.objectStore(storeName);
        const request = store.get(key);

        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
            resolve(request.result ?? null);
        };

        transaction.oncomplete = () => db.close();
    });
}

/**
 * 从 IndexedDB 获取所有数据
 */
export async function dbGetAll<T>(storeName: string): Promise<T[]> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(storeName, 'readonly');
        const store = transaction.objectStore(storeName);
        const request = store.getAll();

        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
            resolve(request.result);
        };

        transaction.oncomplete = () => db.close();
    });
}

/**
 * 向 IndexedDB 存储数据
 */
export async function dbSet<T>(storeName: string, value: T & { key: IDBValidKey }): Promise<void> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(storeName, 'readwrite');
        const store = transaction.objectStore(storeName);
        const request = store.put(value);

        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve();

        transaction.oncomplete = () => db.close();
    });
}

/**
 * 从 IndexedDB 删除数据
 */
export async function dbDelete(storeName: string, key: IDBValidKey): Promise<void> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(storeName, 'readwrite');
        const store = transaction.objectStore(storeName);
        const request = store.delete(key);

        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve();

        transaction.oncomplete = () => db.close();
    });
}

/**
 * 清空 IndexedDB 存储
 */
export async function dbClear(storeName: string): Promise<void> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(storeName, 'readwrite');
        const store = transaction.objectStore(storeName);
        const request = store.clear();

        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve();

        transaction.oncomplete = () => db.close();
    });
}

/**
 * 获取存储中的所有键
 */
export async function dbGetAllKeys(storeName: string): Promise<IDBValidKey[]> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(storeName, 'readonly');
        const store = transaction.objectStore(storeName);
        const request = store.getAllKeys();

        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
            resolve(request.result);
        };

        transaction.oncomplete = () => db.close();
    });
}

/**
 * 检查存储中是否存在某个键
 */
export async function dbHas(storeName: string, key: IDBValidKey): Promise<boolean> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(storeName, 'readonly');
        const store = transaction.objectStore(storeName);
        const request = store.get(key);

        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
            resolve(request.result !== undefined && request.result !== null);
        };

        transaction.oncomplete = () => db.close();
    });
}
