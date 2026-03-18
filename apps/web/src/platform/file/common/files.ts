export enum FileSystemProviderCapabilities {
    /**
     * 不支持任何文件操作
     */
    None = 0,

    /**
     * 支持文件读写
     */
    FileReadWrite = 1 << 1,

    /**
     * 支持文件打开、读写、关闭
     */
    FileOpenReadWriteClose = 1 << 2,
    /**
     * 支持文件读取流
     */
    FileReadStream = 1 << 3,
}

export interface IFileSystemProvider {
    capabilities: FileSystemProviderCapabilities;
}

export interface IFileSystemProviderWithFileReadWriteCapability extends IFileSystemProvider {
    readFile(resource: URI): Promise<Uint8Array>;
    writeFile(resource: URI, content: Uint8Array, opts: IFileWriteOptions): Promise<void>;
}
