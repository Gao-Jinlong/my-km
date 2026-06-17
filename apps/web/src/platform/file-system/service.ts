import { Emitter } from '@/base/common/event';
import type { IDisposable } from '@/base/common/lifecycle';
import { ServiceBase } from '@/platform/base/service-base';
import { Service } from '@/platform/di';
import { PermissionDeniedError, ProviderNotFoundError } from './errors';
import type { IFileSystemProvider } from './provider';
import { type FileContent, type FileStat, FileSystemCapability, type ParsedPath } from './types';
import { hasCapability } from './utils/capability';
import { parsePath } from './utils/path';

/**
 * 文件变更事件载荷
 */
export interface FileChangeEvent {
    /** 发生变更的路径（含 scheme） */
    path: string;
    /** 变更类型 */
    type: 'create' | 'delete' | 'write' | 'rename';
    /** scheme（file:// 等） */
    scheme: string;
}

/**
 * 文件系统服务
 *
 * 统一的文件系统服务入口，负责：
 * - Provider 注册和管理
 * - 路径解析和路由
 * - 能力检查
 * - 方法分发
 * - 文件变更通知（写操作后发事件，供文件树等视图刷新）
 */
@Service({ singleton: true })
export class FileSystemService extends ServiceBase {
    /** 已注册的 Provider 映射表 */
    private providers: Map<string, IFileSystemProvider> = new Map();

    /** 文件变更事件：所有写操作（create/delete/write/rename）后触发 */
    private readonly _onFileChanged = new Emitter<FileChangeEvent>();
    /** 订阅文件变更（文件树等视图用它刷新） */
    readonly onFileChanged = this._onFileChanged.event;

    /**
     * 注册 Provider
     *
     * @param provider - 要注册的 Provider
     */
    registerProvider(provider: IFileSystemProvider): void {
        this.providers.set(provider.scheme, provider);

        // 如果 Provider 是 Disposable，加入资源管理
        if ('dispose' in provider) {
            this._store.add(provider as unknown as IDisposable);
        }
    }

    /**
     * 获取 Provider
     *
     * @param scheme - 协议前缀
     * @returns 对应的 Provider
     * @throws ProviderNotFoundError 当未找到对应 Provider 时
     */
    getProvider(scheme: string): IFileSystemProvider {
        const provider = this.providers.get(scheme);

        if (!provider) {
            throw new ProviderNotFoundError(scheme);
        }

        return provider;
    }

    /**
     * 解析路径并获取 Provider
     *
     * @param path - 完整路径（包含 scheme）
     * @returns 解析结果和对应 Provider
     */
    private resolvePath(path: string): { parsed: ParsedPath; provider: IFileSystemProvider } {
        const parsed = parsePath(path);
        const provider = this.getProvider(parsed.scheme);
        return { parsed, provider };
    }

    /**
     * 检查能力
     *
     * @param provider - Provider
     * @param operation - 操作名称
     * @param required - 所需能力
     * @throws PermissionDeniedError 当能力不足时
     */
    private checkCapability(
        provider: IFileSystemProvider,
        operation: string,
        required: FileSystemCapability,
    ): void {
        if (!hasCapability(provider.capabilities, required)) {
            throw new PermissionDeniedError(operation, FileSystemCapability[required]);
        }
    }

    /**
     * 清理路径中的 scheme 前缀
     *
     * @param path - 完整路径
     * @param scheme - 协议前缀
     * @returns 清理后的路径
     */
    private cleanPath(path: string, scheme: string): string {
        return path.replace(`${scheme}://`, '');
    }

    /**
     * 打开目录
     *
     * @param path - 目录路径（包含 scheme）
     */
    async openDirectory(path: string): Promise<void> {
        const { provider } = this.resolvePath(path);
        this.checkCapability(provider, 'openDirectory', FileSystemCapability.List);

        const cleanPath = this.cleanPath(path, provider.scheme);
        await provider.openDirectory(cleanPath);
    }

    /**
     * 列出目录内容
     *
     * @param path - 目录路径（包含 scheme）
     * @returns 文件统计信息数组
     */
    async listFiles(path: string): Promise<FileStat[]> {
        const { provider } = this.resolvePath(path);
        this.checkCapability(provider, 'listFiles', FileSystemCapability.List);

        const cleanPath = this.cleanPath(path, provider.scheme);
        const files = await provider.listFiles(cleanPath);

        // 为每个 FileStat 添加完整的 URI 路径
        return files.map(file => ({
            ...file,
            path: `${provider.scheme}://${file.path}`,
        }));
    }

    /**
     * 创建目录
     *
     * @param path - 目录路径（包含 scheme）
     */
    async createDirectory(path: string): Promise<void> {
        const { parsed, provider } = this.resolvePath(path);
        this.checkCapability(provider, 'createDirectory', FileSystemCapability.Write);

        const cleanPath = this.cleanPath(path, provider.scheme);
        await provider.createDirectory(cleanPath);
        this._onFileChanged.fire({ path, type: 'create', scheme: parsed.scheme });
    }

    /**
     * 删除目录
     *
     * @param path - 目录路径（包含 scheme）
     */
    async deleteDirectory(path: string): Promise<void> {
        const { parsed, provider } = this.resolvePath(path);
        this.checkCapability(provider, 'deleteDirectory', FileSystemCapability.Write);

        const cleanPath = this.cleanPath(path, provider.scheme);
        await provider.deleteDirectory(cleanPath);
        this._onFileChanged.fire({ path, type: 'delete', scheme: parsed.scheme });
    }

    /**
     * 读取文件内容
     *
     * @param path - 文件路径（包含 scheme）
     * @returns 文件内容
     */
    async readFile(path: string): Promise<FileContent> {
        const { provider } = this.resolvePath(path);
        this.checkCapability(provider, 'readFile', FileSystemCapability.Read);

        const cleanPath = this.cleanPath(path, provider.scheme);
        return provider.readFile(cleanPath);
    }

    /**
     * 写入文件内容
     *
     * @param path - 文件路径（包含 scheme）
     * @param content - 文件内容
     */
    async writeFile(path: string, content: FileContent): Promise<void> {
        const { parsed, provider } = this.resolvePath(path);
        this.checkCapability(provider, 'writeFile', FileSystemCapability.Write);

        const cleanPath = this.cleanPath(path, provider.scheme);
        await provider.writeFile(cleanPath, content);
        this._onFileChanged.fire({ path, type: 'write', scheme: parsed.scheme });
    }

    /**
     * 删除文件
     *
     * @param path - 文件路径（包含 scheme）
     */
    async deleteFile(path: string): Promise<void> {
        const { parsed, provider } = this.resolvePath(path);
        this.checkCapability(provider, 'deleteFile', FileSystemCapability.Write);

        const cleanPath = this.cleanPath(path, provider.scheme);
        await provider.deleteFile(cleanPath);
        this._onFileChanged.fire({ path, type: 'delete', scheme: parsed.scheme });
    }

    /**
     * 获取文件统计信息
     *
     * @param path - 文件路径（包含 scheme）
     * @returns 文件统计信息
     */
    async stat(path: string): Promise<FileStat> {
        const { provider } = this.resolvePath(path);
        this.checkCapability(provider, 'stat', FileSystemCapability.Metadata);

        const cleanPath = this.cleanPath(path, provider.scheme);
        return provider.stat(cleanPath);
    }

    /**
     * 重命名文件
     *
     * @param path - 文件路径（包含 scheme）
     * @param newName - 新名称
     */
    async renameFile(path: string, newName: string): Promise<void> {
        const { parsed, provider } = this.resolvePath(path);
        this.checkCapability(provider, 'renameFile', FileSystemCapability.Write);

        if (!provider.rename) {
            throw new Error(`Provider "${provider.name}" does not support rename operation`);
        }

        const cleanPath = this.cleanPath(path, provider.scheme);
        await provider.rename(cleanPath, newName);
        this._onFileChanged.fire({ path, type: 'rename', scheme: parsed.scheme });
    }

    /**
     * 重命名目录
     *
     * @param path - 目录路径（包含 scheme）
     * @param newName - 新名称
     */
    async renameDirectory(path: string, newName: string): Promise<void> {
        const { parsed, provider } = this.resolvePath(path);
        this.checkCapability(provider, 'renameDirectory', FileSystemCapability.Write);

        if (!provider.rename) {
            throw new Error(`Provider "${provider.name}" does not support rename operation`);
        }

        const cleanPath = this.cleanPath(path, provider.scheme);
        await provider.rename(cleanPath, newName);
        this._onFileChanged.fire({ path, type: 'rename', scheme: parsed.scheme });
    }

    /**
     * 获取文件句柄
     *
     * @param path - 文件路径（包含 scheme）
     * @param mode - 访问模式
     * @returns 文件句柄
     */
    async getFileHandle(
        path: string,
        mode: 'read' | 'readwrite' = 'read',
    ): Promise<FileSystemFileHandle | FileSystemDirectoryHandle> {
        const { provider } = this.resolvePath(path);

        const cleanPath = this.cleanPath(path, provider.scheme);
        return provider.getFileHandle(cleanPath, mode);
    }

    /**
     * 检查路径是否有效
     *
     * @param path - 文件路径
     * @returns 是否有效
     */
    isValidPath(path: string): boolean {
        try {
            this.resolvePath(path);
            return true;
        } catch {
            return false;
        }
    }

    /**
     * 获取所有已注册的 Provider 信息
     */
    getRegisteredProviders(): Array<{ name: string; scheme: string; capabilities: number }> {
        return Array.from(this.providers.values()).map(p => ({
            name: p.name,
            scheme: p.scheme,
            capabilities: p.capabilities,
        }));
    }

    override dispose(): void {
        this._onFileChanged.dispose();
        this.providers.clear();
        super.dispose();
    }
}
