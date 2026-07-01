/**
 * 依赖注入模块
 *
 * @example 构造函数类型自动注入（推荐）
 * ```typescript
 * import { ServiceContainer, Service } from '@/platform/di';
 *
 * @Service()
 * class FileSystemService {}
 *
 * @Service()
 * class FileOpenService {
 *     // 无需 @Inject —— 容器按类型自动注入
 *     constructor(fileService: FileSystemService) {}
 * }
 *
 * const container = new ServiceContainer();
 * container.register(FileSystemService);
 * container.register(FileOpenService);
 * const service = container.get<FileOpenService>(FileOpenService);
 * ```
 *
 * @example 循环依赖用 @Lazy() 破解
 * ```typescript
 * @Service()
 * class A { constructor(@Lazy() b: B) {} }
 * @Service()
 * class B { constructor(@Lazy() a: A) {} }
 * ```
 */

// 导出类型
export type { AnyServiceConstructor, ServiceConstructor, ServiceToken } from './container';
export { ServiceContainer } from './container';
// 装饰器
// 导出内部符号（高级用法，向后兼容）
export {
    Inject,
    Lazy,
    Optional,
    SERVICE_DEPS_KEY,
    SERVICE_ID_KEY,
    Service,
    SINGLETON_KEY,
} from './decorators';
// React hook
export { useService } from './hooks';
