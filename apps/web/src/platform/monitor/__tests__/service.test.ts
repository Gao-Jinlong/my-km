import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MonitorService } from '../service';
import { LogLevel } from '../types';

describe('MonitorService', () => {
    let service: MonitorService;

    beforeEach(() => {
        service = new MonitorService();
    });

    afterEach(() => {
        service.dispose();
    });

    it('应成功初始化', () => {
        expect(service).toBeDefined();
    });

    it('应获取 logger', () => {
        const logger = service.getLogger('test');
        expect(logger).toBeDefined();
    });

    it('未指定分类应使用默认分类', () => {
        const logger = service.getLogger();
        expect(logger).toBeDefined();
    });

    it('应设置全局级别', () => {
        service.setGlobalLevel(LogLevel.DEBUG);
        const logger = service.getLogger('test');
        expect(logger.getLevel()).toBe(LogLevel.DEBUG);
    });

    it('应设置分类级别', () => {
        service.setCategoryLevel('storage', LogLevel.DEBUG);
        const logger = service.getLogger('storage');
        expect(logger.getLevel()).toBe(LogLevel.DEBUG);
    });

    it('分类级别应覆盖全局级别', () => {
        service.setGlobalLevel(LogLevel.WARN);
        service.setCategoryLevel('storage', LogLevel.DEBUG);

        const storageLogger = service.getLogger('storage');
        const otherLogger = service.getLogger('other');

        expect(storageLogger.getLevel()).toBe(LogLevel.DEBUG);
        expect(otherLogger.getLevel()).toBe(LogLevel.WARN);
    });

    it('应添加和移除 writer', () => {
        const mockWriter = {
            name: 'MockWriter',
            write: vi.fn(),
            dispose: vi.fn(),
        };

        service.addWriter(mockWriter);
        service.removeWriter('MockWriter');

        expect(mockWriter.dispose).toHaveBeenCalled();
    });

    it('应清空历史', () => {
        service.clearHistory();
        const history = service.getHistory();
        expect(history).toHaveLength(0);
    });
});
