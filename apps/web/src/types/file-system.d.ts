/**
 * File System Access API type definitions
 */

interface Window {
    showDirectoryPicker?: () => Promise<FileSystemDirectoryHandle>;
}

interface FileSystemDirectoryHandle extends FileSystemHandle {
    getDirectoryHandle(
        name: string,
        options?: { create?: boolean },
    ): Promise<FileSystemDirectoryHandle>;
    getFileHandle(name: string, options?: { create?: boolean }): Promise<FileSystemFileHandle>;
    removeEntry(name: string, options?: { recursive?: boolean }): Promise<void>;
    values(): AsyncIterableIterator<FileSystemHandle>;
}

interface FileSystemFileHandle extends FileSystemHandle {
    getFile(): Promise<File>;
    createWritable(): Promise<FileSystemWritableFileStream>;
}

interface FileSystemHandle {
    readonly kind: 'file' | 'directory';
    readonly name: string;
    isSameEntry(other: FileSystemHandle): Promise<boolean>;
}

interface FileSystemWritableFileStream extends WritableStream {
    write(data: Blob | BufferSource | WriteParams): Promise<void>;
    seek(position: number): Promise<void>;
    truncate(size: number): Promise<void>;
}

interface WriteParams {
    type: 'write' | 'seek' | 'truncate';
    data?: Blob | BufferSource;
    position?: number;
    size?: number;
}
