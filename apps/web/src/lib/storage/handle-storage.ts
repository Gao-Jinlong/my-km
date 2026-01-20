/**
 * FileSystemHandle 存储工具
 * 使用 IndexedDB 持久化 FileSystemDirectoryHandle
 */

const DB_NAME = 'my-km-handles';
const DB_VERSION = 1;
const STORE_NAME = 'handles';

interface StoredHandle {
    id: string;
    handle: FileSystemDirectoryHandle;
    timestamp: number;
}

let db: IDBDatabase | null = null;

/**
 * 初始化 IndexedDB
 */
async function initDB(): Promise<IDBDatabase> {
    if (db) return db;

    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
            db = request.result;
            resolve(db);
        };

        request.onupgradeneeded = event => {
            const database = (event.target as IDBOpenDBRequest).result;
            if (!database.objectStoreNames.contains(STORE_NAME)) {
                database.createObjectStore(STORE_NAME);
            }
        };
    });
}

/**
 * 保存 FileSystemHandle
 */
export async function saveHandle(id: string, handle: FileSystemDirectoryHandle): Promise<void> {
    const database = await initDB();
    return new Promise((resolve, reject) => {
        const transaction = database.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);

        const request = store.put({ id, handle, timestamp: Date.now() });

        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve();
    });
}

/**
 * 获取 FileSystemHandle
 */
export async function getHandle(id: string): Promise<FileSystemDirectoryHandle | null> {
    const database = await initDB();
    return new Promise((resolve, reject) => {
        const transaction = database.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);

        const request = store.get(id);

        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
            const result = request.result as StoredHandle | undefined;
            resolve(result?.handle || null);
        };
    });
}

/**
 * 删除 FileSystemHandle
 */
export async function deleteHandle(id: string): Promise<void> {
    const database = await initDB();
    return new Promise((resolve, reject) => {
        const transaction = database.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);

        const request = store.delete(id);

        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve();
    });
}
