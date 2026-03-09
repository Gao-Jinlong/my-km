/**
 * File System Access API type definitions
 */

export {};

declare global {
    interface FileSystemPickerOptions {
        id?: string;
        mode?: 'read' | 'readwrite';
        startIn?: FileSystemDirectoryHandle | string;
    }

    interface Window {
        showDirectoryPicker(options?: FileSystemPickerOptions): Promise<FileSystemDirectoryHandle>;
    }

    interface FileSystemDirectoryHandle {
        values(): AsyncIterableIterator<FileSystemHandle>;
    }
}
