/**
 * 依赖注入模块
 *
 * @example
 * ```typescript
 * import { ServiceContainer, Service, Inject, Optional } from '@/platform/di';
 *
 * const container = new ServiceContainer();
 * container.register(MyService);
 * const service = container.get<MyService>(MyService);
 * ```
 */

// 导出类型
export type { ServiceConstructor } from './container';
export { ServiceContainer } from './container';
// 导出内部符号（高级用法）
export {
    Inject,
    Optional,
    SERVICE_DEPS_KEY,
    SERVICE_ID_KEY,
    Service,
    SINGLETON_KEY,
} from './decorators';
