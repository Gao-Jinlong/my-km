import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import { DocumentStore } from '../service';

describe('DocumentStore', () => {
    let store: DocumentStore;

    beforeEach(() => {
        store = new DocumentStore();
    });

    afterEach(() => {
        store.dispose();
    });

    describe('put', () => {
        it('应该存储文档元数据', () => {
            store.put('doc-1', { id: 'doc-1', path: '/test/file.km', type: 'km', title: 'Test' });

            const doc = store.get('doc-1');
            expect(doc).toBeDefined();
            expect(doc?.path).toBe('/test/file.km');
            expect(doc?.title).toBe('Test');
        });

        it('应该触发 onDidChange 事件', () => {
            const onChange = vi.fn();
            store.onDidChange(onChange);

            store.put('doc-1', { id: 'doc-1', path: '/test/file.km', type: 'km', title: 'Test' });

            expect(onChange).toHaveBeenCalledTimes(1);
        });

        it('重复 put 同一 id 应该更新而非重复添加', () => {
            store.put('doc-1', { id: 'doc-1', path: '/old/file.km', type: 'km', title: 'Old' });
            store.put('doc-1', { id: 'doc-1', path: '/new/file.km', type: 'km', title: 'New' });

            expect(store.getAll().length).toBe(1);
            expect(store.get('doc-1')?.path).toBe('/new/file.km');
        });
    });

    describe('get', () => {
        it('获取不存在的 id 应返回 undefined', () => {
            expect(store.get('non-existent')).toBeUndefined();
        });
    });

    describe('getByPath', () => {
        it('应该通过路径查找到文档', () => {
            store.put('doc-1', { id: 'doc-1', path: '/test/file.km', type: 'km', title: 'Test' });

            const doc = store.getByPath('/test/file.km');

            expect(doc).toBeDefined();
            expect(doc?.id).toBe('doc-1');
        });

        it('通过不存在的路径查找应返回 undefined', () => {
            expect(store.getByPath('/non-existent')).toBeUndefined();
        });
    });

    describe('remove', () => {
        it('应该移除文档元数据', () => {
            store.put('doc-1', { id: 'doc-1', path: '/test/file.km', type: 'km', title: 'Test' });

            const result = store.remove('doc-1');

            expect(result).toBe(true);
            expect(store.get('doc-1')).toBeUndefined();
            expect(store.getByPath('/test/file.km')).toBeUndefined();
        });

        it('移除后 pathIndex 应该也清理', () => {
            store.put('doc-1', { id: 'doc-1', path: '/test/file.km', type: 'km', title: 'Test' });
            store.remove('doc-1');

            // 重新 put 同一个 path 应该可以
            store.put('doc-2', { id: 'doc-2', path: '/test/file.km', type: 'km', title: 'Test 2' });

            const doc = store.getByPath('/test/file.km');
            expect(doc?.id).toBe('doc-2');
        });

        it('移除不存在的 id 应返回 false', () => {
            expect(store.remove('non-existent')).toBe(false);
        });

        it('移除应该触发 onDidChange 事件', () => {
            store.put('doc-1', { id: 'doc-1', path: '/test/file.km', type: 'km', title: 'Test' });
            const onChange = vi.fn();
            store.onDidChange(onChange);

            store.remove('doc-1');

            expect(onChange).toHaveBeenCalledTimes(1);
        });
    });

    describe('getAll', () => {
        it('应该返回所有文档元数据', () => {
            store.put('doc-1', { id: 'doc-1', path: '/a.km', type: 'km', title: 'A' });
            store.put('doc-2', { id: 'doc-2', path: '/b.km', type: 'km', title: 'B' });

            const all = store.getAll();

            expect(all.length).toBe(2);
        });

        it('空 store 应返回空数组', () => {
            expect(store.getAll()).toEqual([]);
        });
    });

    describe('has', () => {
        it('应该检查 id 是否存在', () => {
            store.put('doc-1', { id: 'doc-1', path: '/test.km', type: 'km', title: 'Test' });

            expect(store.has('doc-1')).toBe(true);
            expect(store.has('doc-2')).toBe(false);
        });
    });

    describe('update 后 path 变化', () => {
        it('更新后旧 path 索引应清理', () => {
            store.put('doc-1', { id: 'doc-1', path: '/old.km', type: 'km', title: 'Old' });
            store.put('doc-1', { id: 'doc-1', path: '/new.km', type: 'km', title: 'New' });

            expect(store.getByPath('/old.km')).toBeUndefined();
            expect(store.getByPath('/new.km')?.id).toBe('doc-1');
        });
    });
});
