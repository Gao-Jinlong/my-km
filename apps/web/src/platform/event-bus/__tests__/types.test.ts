// apps/web/src/platform/event-bus/__tests__/types.test.ts
import { describe, expect, it } from 'vitest';
import { EditorEvents, FileSystemEvents, SystemEvents } from '../types';

describe('EventBus Types', () => {
    it('应正确定义系统事件', () => {
        expect(SystemEvents.AppReady).toBe('system/app/ready');
        expect(SystemEvents.AppWillShutdown).toBe('system/app/will_shutdown');
        expect(SystemEvents.AppDidShutdown).toBe('system/app/did_shutdown');
    });

    it('应正确定义文件系统事件', () => {
        expect(FileSystemEvents.FileSaved).toBe('filesystem/file/saved');
        expect(FileSystemEvents.FileDeleted).toBe('filesystem/file/deleted');
    });

    it('应正确定义编辑器事件', () => {
        expect(EditorEvents.ContentChanged).toBe('editor/content/changed');
        expect(EditorEvents.SelectionChanged).toBe('editor/selection/changed');
    });
});
