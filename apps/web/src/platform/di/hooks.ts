/**
 * React hook for accessing DI services.
 *
 * Services are singletons — once resolved the instance never changes,
 * so this hook intentionally does not trigger re-renders.
 *
 * @example
 * ```typescript
 * 'use client';
 * import { useService } from '@/platform/di';
 * import { CommandService } from '@/platform/command/service';
 *
 * function MyComponent() {
 *     const commandService = useService(CommandService);
 *     // ...
 * }
 * ```
 */

'use client';

import { getContainer } from '@/platform/bootstrap';
import type { ServiceToken } from './container';

export function useService<T>(token: ServiceToken<T>): T {
    // ServiceToken<T> = string | ServiceConstructor<T>；get 的两个重载分别覆盖。
    return getContainer().get(token as string);
}

/**
 * 获取服务实例（非 hook 版本，供非组件代码使用）
 *
 * 等价于 `getContainer().get(token)`，语义清晰。
 */
export function getService<T>(token: ServiceToken<T>): T {
    return getContainer().get(token as string);
}
