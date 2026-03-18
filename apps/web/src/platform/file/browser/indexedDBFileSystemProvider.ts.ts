import { Disposable } from '@/base/common';

export class IndexedDBFileSystemProvider extends Disposable implements FileSystemProvider {
    constructor(private readonly db: IDBDatabase) {
        super();
    }

    async open(path: string): Promise<FileSystemFileHandle> {
        return new FileSystemFileHandle(path);
    }
}
