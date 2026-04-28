/**
 * 依赖注入容器
 *
 * 特性：
 * - 基于类类型的服务注册和解析
 * - 自动循环依赖检测
 * - 懒加载实例化
 * - 单例/多实例支持
 * - 类型安全的依赖注入
 */

import {
    Disposable,
    DisposableStore,
    type IDisposable,
    toDisposable,
} from '../../base/common/lifecycle';
import { SERVICE_DEPS_KEY, SERVICE_ID_KEY, SINGLETON_KEY } from './decorators';

export type ServiceConstructor<T = unknown> = new (...args: unknown[]) => T;

/**
 * 带依赖的 service constructor 类型（用于已注册的服务）
 */
export type AnyServiceConstructor<T = unknown> = abstract new (...args: unknown[]) => T;

interface ServiceRegistration {
    id: string;
    constructor: any;
    dependencies: string[];
    singleton: boolean;
}

/**
 * 服务容器 - 管理所有服务的注册和生命周期
 *
 * @example
 * ```typescript
 * const container = new ServiceContainer();
 *
 * // 注册服务
 * container.register(FileSystemService);
 * container.register(ContextMenuService);
 * container.register(FileOpenService);
 *
 * // 获取服务（类型安全）
 * const fileOpenService = container.get<FileOpenService>(FileOpenService);
 *
 * // 验证依赖
 * const validation = container.validate();
 * if (!validation.valid) {
 *     throw new Error(validation.errors.join(', '));
 * }
 * ```
 */
export class ServiceContainer extends Disposable {
    private registrations = new Map<string, ServiceRegistration>();
    private instances = new Map<string, unknown>();
    protected readonly _store = new DisposableStore();

    /**
     * 注册服务
     *
     * @param constructor 服务类构造函数
     * @returns IDisposable 用于取消注册
     *
     * @example
     * ```typescript
     * container.register(FileSystemService);
     * ```
     */
    register<T>(ctor: AnyServiceConstructor<T>): IDisposable {
        const serviceId = Reflect.getMetadata(SERVICE_ID_KEY, ctor) || ctor.name;
        const singleton = Reflect.getMetadata(SINGLETON_KEY, ctor) ?? true;
        const depsMetadata = Reflect.getMetadata(SERVICE_DEPS_KEY, ctor) || {};

        // 将索引映射的依赖转换为数组
        const dependencies = Object.values(depsMetadata);

        const registration: ServiceRegistration = {
            id: serviceId,
            constructor: ctor,
            dependencies: dependencies as string[],
            singleton,
        };

        if (this.registrations.has(serviceId)) {
            console.warn(`Service ${serviceId} already registered, overriding`);
        }

        this.registrations.set(serviceId, registration);

        return toDisposable(() => {
            this.registrations.delete(serviceId);
            this.instances.delete(serviceId);
        });
    }

    /**
     * 获取服务实例（类型安全）
     *
     * @param id 服务类或字符串 ID
     * @returns 服务实例
     *
     * @example
     * ```typescript
     * const service = container.get(FileOpenService);  // 类型推断为 FileOpenService
     * // 或
     * const service = container.get('fileOpenService');
     * ```
     */
    get<T>(id: string): T;
    get<T>(id: ServiceConstructor<T>): T;
    get<T>(id: string | ServiceConstructor<T>): T {
        const serviceId =
            typeof id === 'string' ? id : Reflect.getMetadata(SERVICE_ID_KEY, id) || id.name;
        return this._resolve(serviceId, []) as T;
    }

    /**
     * 内部解析方法（带循环依赖检测）
     */
    private _resolve<T>(serviceId: string, resolutionPath: string[]): T {
        // 检查循环依赖
        if (resolutionPath.includes(serviceId)) {
            const cycle = [...resolutionPath, serviceId].join(' -> ');
            throw new Error(
                `Circular dependency detected: ${cycle}\n\n` +
                    `Services involved: ${[...new Set(resolutionPath)].join(', ')}`,
            );
        }

        // 检查是否已缓存（单例）
        const cached = this.instances.get(serviceId);
        if (cached) {
            return cached as T;
        }

        // 获取服务注册信息
        const registration = this.registrations.get(serviceId);
        if (!registration) {
            throw new Error(`Service "${serviceId}" not registered`);
        }

        // 添加到解析栈
        const newPath = [...resolutionPath, serviceId];

        // 获取可选依赖
        const optionalDeps = Reflect.getMetadata('di:optional', registration.constructor) || {};

        // 递归解析依赖
        const resolvedDeps = registration.dependencies.map((depId, index) => {
            // 检查是否为可选依赖
            if (optionalDeps[index]) {
                try {
                    return this._resolve(depId, newPath);
                } catch {
                    return undefined;
                }
            }

            try {
                return this._resolve(depId, newPath);
            } catch (error) {
                if ((error as Error).message.startsWith('Circular dependency')) {
                    throw error;
                }
                throw new Error(
                    `Failed to resolve dependency "${depId}" for service "${serviceId}": ` +
                        `${(error as Error).message}`,
                );
            }
        });

        // 创建实例
        const instance = new registration.constructor(...resolvedDeps);

        // 单例缓存
        if (registration.singleton) {
            this.instances.set(serviceId, instance as unknown);
        }

        return instance as T;
    }

    /**
     * 获取依赖图（用于调试）
     */
    getDependencyGraph(): Record<string, string[]> {
        const graph: Record<string, string[]> = {};
        for (const [id, reg] of this.registrations) {
            graph[id] = reg.dependencies;
        }
        return graph;
    }

    /**
     * 检测循环依赖（不实际实例化）
     *
     * @returns 循环依赖路径数组
     */
    detectCircularDependencies(): string[] {
        const cycles: string[] = [];
        const visited = new Set<string>();
        const stack = new Set<string>();

        const dfs = (serviceId: string, path: string[]) => {
            if (stack.has(serviceId)) {
                const cycleStart = path.indexOf(serviceId);
                const cycle = path.slice(cycleStart).concat(serviceId);
                cycles.push(cycle.join(' -> '));
                return;
            }

            if (visited.has(serviceId)) return;

            visited.add(serviceId);
            stack.add(serviceId);

            const reg = this.registrations.get(serviceId);
            if (reg) {
                for (const depId of reg.dependencies) {
                    dfs(depId, [...path, serviceId]);
                }
            }

            stack.delete(serviceId);
        };

        for (const serviceId of this.registrations.keys()) {
            dfs(serviceId, []);
        }

        return cycles;
    }

    /**
     * 验证所有依赖可解析
     *
     * @returns 验证结果
     */
    validate(): { valid: boolean; errors: string[] } {
        const errors: string[] = [];

        // 检查循环依赖
        const cycles = this.detectCircularDependencies();
        if (cycles.length > 0) {
            errors.push(`Circular dependencies found:\n${cycles.join('\n')}`);
        }

        // 检查缺失的依赖
        for (const [id, reg] of this.registrations) {
            for (const depId of reg.dependencies) {
                if (!this.registrations.has(depId)) {
                    errors.push(`Service "${id}" depends on "${depId}" which is not registered`);
                }
            }
        }

        return {
            valid: errors.length === 0,
            errors,
        };
    }

    /**
     * 检查服务是否已注册
     */
    has(id: string | ServiceConstructor<unknown>): boolean {
        const serviceId =
            typeof id === 'string' ? id : Reflect.getMetadata(SERVICE_ID_KEY, id) || id.name;
        return this.registrations.has(serviceId);
    }

    /**
     * 注册已有实例（用于非 DI 创建的服务）
     *
     * @param id 服务标识
     * @param instance 服务实例
     *
     * @example
     * ```typescript
     * const harness = createAIHarnessService();
     * container.registerInstance('aiHarness', harness);
     * ```
     */
    registerInstance<T>(id: string, instance: T): void {
        if (this.instances.has(id)) {
            console.warn(`Service instance "${id}" already registered, overriding`);
        }
        this.instances.set(id, instance as unknown);
    }

    override dispose(): void {
        this._store.dispose();
        this.registrations.clear();
        this.instances.clear();
        super.dispose();
    }
}
