/**
 * MonitorService 访问工具
 *
 * 提供统一的 logger 获取方式，避免重复书写 container.get()
 *
 * 注意：本文件是底层工具，不依赖上层服务
 * 仅供非 DI 管理的组件和工具函数使用
 */

import { getContainer } from '@/platform/bootstrap';
import { MonitorService } from './service';
import type { Logger } from './types';

/**
 * 获取指定分类的 logger
 *
 * @param category - 日志分类，如 'api', 'editor', 'workspace' 等
 * @returns Logger 实例
 *
 * @example
 * ```typescript
 * const logger = getMonitor('api');
 * logger.info('API request started');
 *
 * const editorLogger = getMonitor('editor');
 * editorLogger.error('Editor failed to load');
 * ```
 */
export function getMonitor(category: string): Logger {
    return getContainer().get(MonitorService).getLogger(category);
}
