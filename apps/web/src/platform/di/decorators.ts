/**
 * 依赖注入装饰器
 *
 * 使用 TypeScript 装饰器实现类型安全的依赖注入
 * 基于类的类型自动推断服务 ID，无需手动指定字符串 ID
 *
 * 注意：reflect-metadata 由 bootstrap.ts 统一加载，确保在任何装饰器求值前可用
 */

const SERVICE_ID_KEY = Symbol('di:service_id');
const SERVICE_DEPS_KEY = Symbol('di:service_deps');
const SINGLETON_KEY = Symbol('di:singleton');

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
 * 依赖注入装饰器 - 标记构造函数参数为依赖
 *
 * 支持三种方式：
 * 1. @Inject() - 自动从类型推断服务 ID
 * 2. @Inject(SomeService) - 使用类作为服务 ID（推荐）
 * 3. @Inject('customId') - 使用字符串 ID（不推荐，仅用于特殊情况）
 *
 * @example
 * ```typescript
 * @Service()
 * class FileOpenService extends ServiceBase {
 *     constructor(
 *         @Inject(FileSystemService) private fileService: FileSystemService,  // 推荐
 *         @Inject(ContextMenuService) private contextMenu: ContextMenuService,
 *     ) {
 *         super();
 *     }
 * }
 * ```
 */
export function Inject(serviceId?: string | (abstract new (...args: never[]) => unknown)) {
    return (target: object, propertyKey: string | symbol | undefined, parameterIndex: number) => {
        // 从反射元数据获取参数类型
        const paramTypes = Reflect.getMetadata('design:paramtypes', target, propertyKey);
        const paramType = paramTypes?.[parameterIndex];

        // 确定服务 ID 的优先级：
        // 1. 显式指定的字符串 ID
        // 2. 显式指定的类
        // 3. 从参数类型推断（类名）
        let resolvedId: string;

        if (typeof serviceId === 'string') {
            resolvedId = serviceId;
        } else if (typeof serviceId === 'function' && serviceId !== undefined) {
            // 使用类本身作为标识，从元数据获取注册的服务 ID
            const metadataId = Reflect.getMetadata(SERVICE_ID_KEY, serviceId);
            resolvedId = metadataId || serviceId.name;
        } else if (paramType) {
            const metadataId = Reflect.getMetadata(SERVICE_ID_KEY, paramType);
            resolvedId = metadataId || paramType.name;
        } else {
            throw new Error(
                `Cannot determine service ID for parameter ${parameterIndex} of ${String(propertyKey)}. ` +
                    `Use @Inject(SomeServiceClass) to specify the dependency explicitly.`,
            );
        }

        // 保存依赖信息（使用索引映射）
        let existingDeps = Reflect.getMetadata(SERVICE_DEPS_KEY, target);
        if (!existingDeps) {
            existingDeps = {};
        }
        existingDeps[parameterIndex] = resolvedId;
        Reflect.defineMetadata(SERVICE_DEPS_KEY, existingDeps, target);
    };
}

/**
 * 可选依赖装饰器 - 标记依赖为可选
 *
 * @example
 * ```typescript
 * @Service()
 * class OptionalFeatureService extends ServiceBase {
 *     constructor(
 *         @Inject(RequiredService) private required: RequiredService,
 *         @Inject('optionalFeature') @Optional() private optional?: OptionalService,
 *     ) {
 *         super();
 *     }
 * }
 * ```
 */
export function Optional() {
    return (target: object, _propertyKey: string | symbol | undefined, parameterIndex: number) => {
        let existingOptional = Reflect.getMetadata('di:optional', target);
        if (!existingOptional) {
            existingOptional = [];
        }
        existingOptional[parameterIndex] = true;
        Reflect.defineMetadata('di:optional', existingOptional, target);
    };
}

// 内部导出，供 ServiceContainer 使用
export { SERVICE_ID_KEY, SERVICE_DEPS_KEY, SINGLETON_KEY };
