/**
 * 测试辅助：创建一个最小化的 MonitorService mock
 *
 * 用于需要构造函数注入 MonitorService 的服务单测。
 */
import type { IMonitorService, Logger } from '../types';

export function createMockMonitorService(): IMonitorService {
    const noop = () => {};
    const logger: Logger = {
        debug: noop,
        info: noop,
        warn: noop,
        error: noop,
        setLevel: noop,
        level: 2,
    } as unknown as Logger;
    const mock = {
        getLogger: () => logger,
        setGlobalLevel: noop,
        addWriter: noop,
        removeWriter: noop,
        getHistory: () => [],
        clearHistory: noop,
        onLogChange: () => ({ dispose: noop }),
    };
    return mock as unknown as IMonitorService;
}
