/**
 * 依赖注入容器
 *
 * 特性：
 * - **构造函数类型自动注入**（NestJS 风格）：根据 `design:paramtypes` 自动解析依赖
 * - `@Inject(token)` 显式覆盖，支持字符串 token / interface 注入
 * - `@Lazy()` 延迟代理，破解构造函数循环依赖
 * - `@Optional()` 可选依赖容错
 * - 自动循环依赖检测（resolve 时 + validate 静态扫描）
 * - 懒加载实例化 + 单例/多实例支持
 */

import {
    Disposable,
    DisposableStore,
    type IDisposable,
    toDisposable,
} from '../../base/common/lifecycle';
import { getInjectionTokens, SERVICE_ID_KEY, SINGLETON_KEY } from './decorators';

// biome-ignore lint/suspicious/noExplicitAny: 构造函数类型签名需要 any[] 以兼容带具体依赖类型的构造函数（逆变兼容）
export type ServiceConstructor<T = unknown> = new (...args: any[]) => T;

/**
 * 带依赖的 service constructor 类型（用于已注册的服务）
 *
 * 使用 `any[]` 参数以兼容带具体依赖类型的构造函数（逆变兼容）。
 */
// biome-ignore lint/suspicious/noExplicitAny: 同上，构造函数签名需要 any[] 兼容逆变
export type AnyServiceConstructor<T = unknown> = abstract new (...args: any[]) => T;

/**
 * 服务 token —— 类构造函数或字符串 ID
 */
export type ServiceToken<T = unknown> = string | ServiceConstructor<T>;

const CIRCULAR_DEPENDENCY_ERROR = `Circular dependency detected`;

interface ServiceRegistration {
    id: string;
    // biome-ignore lint/suspicious/noExplicitAny: 存储任意服务构造函数，实例化时通过 registration 统一处理
    constructor: any;
    /** 每个 constructor 参数对应的 service ID；null 表示无法推断（resolve 时按 optional/报错处理） */
    dependencies: (string | null)[];
    optionals: boolean[];
    lazies: boolean[];
    singleton: boolean;
}

/**
 * 创建一个惰性代理：首次属性访问时才调用 resolver 解析真实实例，之后直接转发。
 *
 * 用于破解 A → B → A 构造函数循环：当解析路径出现循环时，
 * 对标了 @Lazy() 的参数返回此代理，避免在构造期递归实例化。
 *
 * 注意：代理显式处理了 `then`，避免被 `await` 误判为 thenable。
 */
function createLazyProxy<T extends object>(resolver: () => T): T {
    let resolved: T | undefined;
    let resolveError: unknown;
    let attempted = false;

    const getInstance = (): T => {
        if (!attempted) {
            attempted = true;
            try {
                resolved = resolver();
            } catch (e) {
                resolveError = e;
                throw e;
            }
        }
        if (resolveError !== undefined) {
            throw resolveError;
        }
        return resolved as T;
    };

    return new Proxy({} as T, {
        get(_target, prop, _receiver) {
            // 避免 Promise 协议误判（thenable 检查）
            if (prop === 'then') {
                return undefined;
            }
            const instance = getInstance();
            const value = Reflect.get(instance, prop, instance);
            // 方法需要绑定 this 到真实实例
            if (typeof value === 'function') {
                return value.bind(instance);
            }
            return value;
        },
        set(_target, prop, value, _receiver) {
            const instance = getInstance();
            return Reflect.set(instance, prop, value, instance);
        },
        has(_target, prop) {
            const instance = getInstance();
            return Reflect.has(instance, prop);
        },
        deleteProperty(_target, prop) {
            const instance = getInstance();
            return Reflect.deleteProperty(instance, prop);
        },
        ownKeys(_target) {
            const instance = getInstance();
            return Reflect.ownKeys(instance);
        },
        getOwnPropertyDescriptor(_target, prop) {
            const instance = getInstance();
            const desc = Reflect.getOwnPropertyDescriptor(instance, prop);
            if (desc) {
                // 让代理上的属性描述符可枚举性反映真实实例
                return { ...desc, configurable: true };
            }
            return undefined;
        },
        getPrototypeOf(_target) {
            const instance = getInstance();
            return Reflect.getPrototypeOf(instance);
        },
    });
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
 * container.register(FileOpenService);
 *
 * // 获取服务（类型安全）—— 依赖会按构造函数类型自动注入
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
     * 注册时通过 `design:paramtypes` 自动分析构造函数依赖；
     * `@Inject(token)` 可按 index 覆盖某个参数的 token。
     *
     * @param constructor 服务类构造函数
     * @returns IDisposable 用于取消注册
     */
    register<T>(ctor: AnyServiceConstructor<T>): IDisposable {
        const serviceId = Reflect.getMetadata(SERVICE_ID_KEY, ctor) || ctor.name;
        const singleton = Reflect.getMetadata(SINGLETON_KEY, ctor) ?? true;

        // 收集注入信息：合并 design:paramtypes（默认）+ @Inject override
        const { tokens, optionals, lazies } = getInjectionTokens(ctor);

        const registration: ServiceRegistration = {
            id: serviceId,
            constructor: ctor,
            dependencies: tokens,
            optionals,
            lazies,
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
     *
     * 解析策略：
     * 1. 单例缓存命中 → 直接返回
     * 2. 遍历 dependencies：
     *    - null token（类型无法推断）+ optional → undefined；否则报错
     *    - 构成循环 + lazy → 返回 createLazyProxy
     *    - 构成循环 + 非 lazy → 抛循环依赖异常
     *    - 正常 → 递归 _resolve
     * 3. `new ctor(...resolvedDeps)` 实例化
     * 4. 单例缓存
     */
    private _resolve<T>(serviceId: string, resolutionPath: string[]): T {
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

        // 检查循环依赖
        if (resolutionPath.includes(serviceId)) {
            const cycle = [...resolutionPath, serviceId].join(' -> ');
            throw new Error(
                `${CIRCULAR_DEPENDENCY_ERROR}: ${cycle}\n\n` +
                    `Services involved: ${[...new Set(resolutionPath)].join(', ')}\n` +
                    `提示：使用 @Lazy() 装饰器可破解构造函数循环依赖。`,
            );
        }

        // 添加到解析栈
        const newPath = [...resolutionPath, serviceId];

        // 递归解析依赖
        const resolvedDeps = registration.dependencies.map((depId, index) => {
            // 无法推断 token（通常是 interface 参数未标 @Inject）
            if (depId === null) {
                if (registration.optionals[index]) {
                    return undefined;
                }
                throw new Error(
                    `Failed to resolve dependency at index ${index} for service "${serviceId}": ` +
                        `无法从构造函数类型推断依赖 token。` +
                        `请使用 @Inject(token) 显式指定，或确保参数类型是 @Service 类。`,
                );
            }

            // 循环检测：如果该依赖已在解析路径中
            if (newPath.includes(depId)) {
                if (registration.lazies[index]) {
                    // @Lazy() 破环：返回代理，延迟到首次属性访问时解析
                    return createLazyProxy<object>(() => this._resolve(depId, []));
                }
                // 非 lazy 的构造函数循环 → 抛异常
                const cycle = [...newPath, depId].join(' -> ');
                throw new Error(
                    `${CIRCULAR_DEPENDENCY_ERROR}: ${cycle}\n\n` +
                        `提示：使用 @Lazy() 装饰器可破解构造函数循环依赖。`,
                );
            }

            // 可选依赖：解析失败返回 undefined
            if (registration.optionals[index]) {
                try {
                    return this._resolve(depId, newPath);
                } catch (error) {
                    // 循环依赖异常仍然需要抛出
                    if ((error as Error).message.startsWith(CIRCULAR_DEPENDENCY_ERROR)) {
                        throw error;
                    }
                    return undefined;
                }
            }

            // 必需依赖：解析失败抛出
            try {
                return this._resolve(depId, newPath);
            } catch (error) {
                if ((error as Error).message.startsWith(CIRCULAR_DEPENDENCY_ERROR)) {
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
            graph[id] = reg.dependencies.filter((d): d is string => d !== null);
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
                    if (depId === null) continue;
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
            reg.dependencies.forEach((depId, index) => {
                if (depId === null) {
                    if (!reg.optionals[index]) {
                        errors.push(
                            `Service "${id}" has a constructor parameter at index ${index} ` +
                                `whose dependency type cannot be inferred. Use @Inject(token).`,
                        );
                    }
                    return;
                }
                if (!this.registrations.has(depId)) {
                    errors.push(`Service "${id}" depends on "${depId}" which is not registered`);
                }
            });
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
