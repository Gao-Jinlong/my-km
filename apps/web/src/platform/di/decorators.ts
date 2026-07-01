/**
 * 依赖注入装饰器
 *
 * 使用 TypeScript 装饰器实现类型安全的依赖注入。
 *
 * 支持两种注入方式：
 * 1. **构造函数类型自动注入**（推荐，NestJS 风格）—— 只要构造函数参数类型是已注册的 `@Service` 类，
 *    容器会自动从 `design:paramtypes` 读取并注入，无需任何参数装饰器。
 * 2. **显式 `@Inject(token)`**—— 用于覆盖类型推断、指定字符串 token、或注入 interface。
 *
 * 注意：reflect-metadata 在此文件顶部导入，确保任何使用 @Service/@Inject 的模块
 * 在装饰器求值前 polyfill 已就绪（不依赖外部 import 顺序）。
 */

// reflect-metadata 必须在装饰器求值前加载。
// 放在这里（而非 bootstrap.ts）是因为：任何 import 了 @Service 的模块都会先加载本文件，
// 从而保证 Reflect.defineMetadata / Reflect.getMetadata 在装饰器执行时存在。
import 'reflect-metadata';

const SERVICE_ID_KEY = Symbol('di:service_id');
const SERVICE_DEPS_KEY = Symbol('di:service_deps'); // @Inject 写入的 index → token override
const SINGLETON_KEY = Symbol('di:singleton');
const LAZY_KEY = Symbol('di:lazy'); // @Lazy 写入的 index → boolean
const OPTIONAL_KEY = 'di:optional'; // 保持与旧实现一致（字符串 key）

export { OPTIONAL_KEY };

/**
 * 服务装饰器 - 标记一个类为可注入服务
 *
 * @param options.id 可选的服务 ID，默认使用类名
 * @param options.singleton 是否单例，默认 true
 *
 * @example
 * ```typescript
 * @Service()  // 自动使用类名
 * class MyService {}
 *
 * @Service({ id: 'customId', singleton: true })  // 自定义 ID
 * class AnotherService {}
 * ```
 */
export function Service(options: { id?: string; singleton?: boolean } = {}) {
    return <T extends abstract new (...args: never[]) => unknown>(ctor: T) => {
        // 使用类名作为默认服务 ID
        const serviceId = options.id || ctor.name;

        Reflect.defineMetadata(SERVICE_ID_KEY, serviceId, ctor);
        Reflect.defineMetadata(SINGLETON_KEY, options.singleton ?? true, ctor);

        return ctor;
    };
}

/**
 * 依赖注入装饰器 - 显式指定构造函数参数的依赖 token
 *
 * **大多数情况下不需要此装饰器**——容器会自动根据参数类型（`design:paramtypes`）注入。
 * 仅在以下场景使用：
 * 1. 注入字符串 token（非类标识）
 * 2. 注入 interface（编译后类型信息丢失）
 * 3. 需要覆盖默认的类型推断
 *
 * @example
 * ```typescript
 * @Service()
 * class FileOpenService extends ServiceBase {
 *     constructor(
 *         fileService: FileSystemService,  // ← 自动注入，无需 @Inject
 *         @Inject('LOGGER') logger: Logger, // ← interface，需显式 token
 *     ) {
 *         super();
 *     }
 * }
 * ```
 */
export function Inject(serviceId?: string | (abstract new (...args: never[]) => unknown)) {
    return (target: object, _propertyKey: string | symbol | undefined, parameterIndex: number) => {
        // 保存原始 serviceId 引用（可能是 string、class、或 undefined）。
        // 延迟到 getInjectionTokens（register 时）再解析为字符串 token，
        // 以容忍装饰器求值时类尚未初始化的循环引用场景。
        let existingDeps = Reflect.getMetadata(SERVICE_DEPS_KEY, target);
        if (!existingDeps) {
            existingDeps = {};
        }
        // 存原始值：string 原样存；class 也原样存（register 时再读元数据）；undefined 存 null 标记
        existingDeps[parameterIndex] = serviceId ?? null;
        Reflect.defineMetadata(SERVICE_DEPS_KEY, existingDeps, target);
    };
}

/**
 * 可选依赖装饰器 - 标记依赖为可选
 *
 * 当依赖未注册时，注入 `undefined` 而非抛出异常。
 *
 * @example
 * ```typescript
 * @Service()
 * class OptionalFeatureService extends ServiceBase {
 *     constructor(
 *         requiredService: RequiredService,                      // 必需，自动注入
 *         @Optional() @Inject('optional') optional?: SomeService, // 可选
 *     ) {
 *         super();
 *     }
 * }
 * ```
 */
export function Optional() {
    return (target: object, _propertyKey: string | symbol | undefined, parameterIndex: number) => {
        let existingOptional = Reflect.getMetadata(OPTIONAL_KEY, target);
        if (!existingOptional) {
            existingOptional = [];
        }
        existingOptional[parameterIndex] = true;
        Reflect.defineMetadata(OPTIONAL_KEY, existingOptional, target);
    };
}

/**
 * 惰性注入装饰器 - 破解构造函数循环依赖
 *
 * 当 A 和 B 互相依赖时，至少一边标 `@Lazy()`：
 * 容器检测到循环时返回一个 Proxy，**首次属性访问**才真正解析实例。
 * 这使得构造函数中暂时不使用的依赖可以安全地延迟解析。
 *
 * @example
 * ```typescript
 * @Service()
 * class ServiceA {
 *     constructor(
 *         b: ServiceB,                          // 直接注入
 *         @Lazy() otherB: ServiceB,             // 延迟注入（破解循环）
 *     ) {}
 * }
 *
 * @Service()
 * class ServiceB {
 *     constructor(@Lazy() a: ServiceA) {}       // 延迟注入
 * }
 * ```
 */
export function Lazy() {
    return (target: object, _propertyKey: string | symbol | undefined, parameterIndex: number) => {
        let existingLazy = Reflect.getMetadata(LAZY_KEY, target);
        if (!existingLazy) {
            existingLazy = [];
        }
        existingLazy[parameterIndex] = true;
        Reflect.defineMetadata(LAZY_KEY, existingLazy, target);
    };
}

/**
 * 把一个类型（来自 design:paramtypes）解析为 service token
 *
 * - 普通类：读 SERVICE_ID_KEY，fallback 到 .name
 * - Object（interface / 编译后类型丢失）：返回 null，表示无法推断
 */
function typeToToken(type: unknown): string | null {
    if (type == null) {
        return null;
    }
    // 基础类型：String / Number / Boolean 等不是服务
    if (typeof type !== 'function') {
        return null;
    }
    // Object 通常代表 interface（编译后丢失具体类型），无法推断
    if (type === Object) {
        return null;
    }
    const metadataId = Reflect.getMetadata(SERVICE_ID_KEY, type);
    return metadataId || type.name;
}

/**
 * 收集一个 constructor 的完整注入信息（供 ServiceContainer.register 使用）
 *
 * 合并逻辑：
 * - 基础依赖来自 `design:paramtypes`（TS 编译器写入的类型数组）
 * - `@Inject(token)` 写入的 override 优先级更高，按 index 覆盖
 *
 * @returns tokens: 每个 constructor 参数对应的 service ID（null 表示无法推断，resolve 时报错或按 optional 处理）
 *          optionals: 每个 index 是否可选
 *          lazies: 每个 index 是否惰性
 */
export function getInjectionTokens(ctor: unknown): {
    tokens: (string | null)[];
    optionals: boolean[];
    lazies: boolean[];
} {
    const target = ctor as object;
    const paramTypes: unknown[] = Reflect.getMetadata('design:paramtypes', target) || [];
    // @Inject 存储的 override 可能是 string（token）、class（构造函数）、或 null
    // biome-ignore lint/suspicious/noExplicitAny: 构造函数类型签名需要 any[] 兼容各类服务构造函数
    const injectOverrides: Record<
        number,
        string | (abstract new (...args: any[]) => unknown) | null
    > = Reflect.getMetadata(SERVICE_DEPS_KEY, target) || {};
    const optionalFlags: boolean[] = Reflect.getMetadata(OPTIONAL_KEY, target) || [];
    const lazyFlags: boolean[] = Reflect.getMetadata(LAZY_KEY, target) || [];

    // 参数个数取 paramTypes 与 @Inject/@Optional/@Lazy 标记的最大 index 之较大者。
    // 某些构建工具（如 esbuild）不输出 design:paramtypes，
    // 此时仅靠 @Inject 覆盖仍需能推断出参数个数。
    let maxMetaIndex = -1;
    for (const key of Object.keys(injectOverrides)) {
        const idx = Number(key);
        if (!Number.isNaN(idx) && idx > maxMetaIndex) maxMetaIndex = idx;
    }
    if (Array.isArray(optionalFlags)) {
        optionalFlags.forEach((_, i) => {
            if (i > maxMetaIndex) maxMetaIndex = i;
        });
    }
    if (Array.isArray(lazyFlags)) {
        lazyFlags.forEach((_, i) => {
            if (i > maxMetaIndex) maxMetaIndex = i;
        });
    }
    const paramCount = Math.max(paramTypes.length, maxMetaIndex + 1);

    const tokens: (string | null)[] = [];
    for (let index = 0; index < paramCount; index++) {
        const override = injectOverrides[index];
        // @Inject 的 override 优先：可能是 string、class、或 null
        if (override != null) {
            if (typeof override === 'string') {
                tokens.push(override);
                continue;
            }
            // class 引用 —— register 时类已初始化，读元数据拿 service ID
            const metadataId = Reflect.getMetadata(SERVICE_ID_KEY, override);
            if (metadataId) {
                tokens.push(metadataId);
                continue;
            }
            if (typeof override === 'function') {
                tokens.push(override.name);
                continue;
            }
        }
        // 否则从类型推断（paramTypes 可能缺失 → null）
        tokens.push(typeToToken(paramTypes[index]));
    }

    return {
        tokens,
        optionals: tokens.map((_, index) => optionalFlags[index] === true),
        lazies: tokens.map((_, index) => lazyFlags[index] === true),
    };
}

// 内部导出，供 ServiceContainer 使用
export { SERVICE_DEPS_KEY, SERVICE_ID_KEY, SINGLETON_KEY, LAZY_KEY };
