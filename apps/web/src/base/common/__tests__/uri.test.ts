import { describe, expect, it } from 'vitest';
import { URI } from '../uri';

describe('URI', () => {
    describe('parse 方法', () => {
        it('应该解析标准 file:// URI', () => {
            const uri = URI.parse('file:///Users/project/docs/readme.md');

            expect(uri.scheme).toBe('file');
            expect(uri.authority).toBe('');
            expect(uri.path).toBe('/Users/project/docs/readme.md');
            expect(uri.query).toBe('');
            expect(uri.fragment).toBe('');
        });

        it('应该解析带查询参数的 URI', () => {
            const uri = URI.parse('file:///docs/readme.md?v=1#intro');

            expect(uri.scheme).toBe('file');
            expect(uri.path).toBe('/docs/readme.md');
            expect(uri.query).toBe('v=1');
            expect(uri.fragment).toBe('intro');
        });

        it('应该解析 idb:// URI', () => {
            const uri = URI.parse('idb://project-123/files/test.md');

            expect(uri.scheme).toBe('idb');
            expect(uri.authority).toBe('project-123');
            expect(uri.path).toBe('/files/test.md');
        });

        it('应该抛出无效 URI 错误', () => {
            expect(() => URI.parse('invalid-uri-without-scheme')).toThrow('Invalid URI');
        });

        it('应该解析只有 scheme 和 path 的 URI', () => {
            const uri = URI.parse('file:///docs/readme.md');

            expect(uri.scheme).toBe('file');
            expect(uri.path).toBe('/docs/readme.md');
        });
    });

    describe('from 方法', () => {
        it('应该从完整组件构建 URI', () => {
            const uri = URI.from({
                scheme: 'file',
                authority: '',
                path: '/docs/readme.md',
                query: 'v=2',
                fragment: 'intro',
            });

            expect(uri.scheme).toBe('file');
            expect(uri.path).toBe('/docs/readme.md');
            expect(uri.query).toBe('v=2');
            expect(uri.fragment).toBe('intro');
        });

        it('应该从最小组件构建 URI', () => {
            const uri = URI.from({
                scheme: 'file',
                authority: '',
                path: '/docs/readme.md',
                query: '',
                fragment: '',
            });

            expect(uri.scheme).toBe('file');
            expect(uri.path).toBe('/docs/readme.md');
            expect(uri.authority).toBe('');
            expect(uri.query).toBe('');
            expect(uri.fragment).toBe('');
        });

        it('应该处理未提供的组件', () => {
            const uri = URI.from({
                scheme: 'idb',
                authority: 'my-db',
                path: '/files/test.md',
                query: '',
                fragment: '',
            });

            expect(uri.scheme).toBe('idb');
            expect(uri.authority).toBe('my-db');
            expect(uri.path).toBe('/files/test.md');
        });
    });

    describe('file 方法', () => {
        it('应该创建绝对路径 URI', () => {
            const uri = URI.file('/Users/project/docs/readme.md');

            expect(uri.scheme).toBe('file');
            expect(uri.path).toBe('/Users/project/docs/readme.md');
            expect(uri.authority).toBe('');
            expect(uri.query).toBe('');
            expect(uri.fragment).toBe('');
        });

        it('应该创建不同路径的 URI', () => {
            const uri1 = URI.file('/docs/readme.md');
            const uri2 = URI.file('/src/index.ts');

            expect(uri1.path).toBe('/docs/readme.md');
            expect(uri2.path).toBe('/src/index.ts');
        });
    });

    describe('isUri 类型守卫', () => {
        it('应该正确识别 URI 实例', () => {
            const uri = URI.parse('file:///docs/readme.md');

            expect(URI.isUri(uri)).toBe(true);
        });

        it('应该正确识别非 URI 对象', () => {
            expect(URI.isUri({})).toBe(false);
            expect(URI.isUri(null)).toBe(false);
            expect(URI.isUri(undefined)).toBe(false);
            expect(URI.isUri('string')).toBe(false);
            expect(URI.isUri(123)).toBe(false);
        });
    });

    describe('toString 方法', () => {
        it('应该序列化简单 URI', () => {
            const uri = URI.parse('file:///docs/readme.md');

            expect(uri.toString()).toBe('file:///docs/readme.md');
        });

        it('应该序列化带查询参数和片段的 URI', () => {
            const uri = URI.parse('file:///docs/readme.md?v=1#intro');

            expect(uri.toString()).toBe('file:///docs/readme.md?v=1#intro');
        });

        it('应该序列化 idb:// URI', () => {
            const uri = URI.parse('idb://project-123/files/test.md');

            expect(uri.toString()).toBe('idb://project-123/files/test.md');
        });

        it('应该序列化带 authority 的 URI', () => {
            const uri = URI.from({
                scheme: 'idb',
                authority: 'my-db',
                path: '/files/test.md',
                query: '',
                fragment: '',
            });

            expect(uri.toString()).toBe('idb://my-db/files/test.md');
        });
    });

    describe('toJSON 方法', () => {
        it('应该序列化为完整 JSON', () => {
            const uri = URI.parse('file:///docs/readme.md?v=1#intro');
            const json = uri.toJSON();

            expect(json).toEqual({
                scheme: 'file',
                authority: '',
                path: '/docs/readme.md',
                query: 'v=1',
                fragment: 'intro',
            });
        });

        it('应该序列化为最简 JSON', () => {
            const uri = URI.file('/docs/readme.md');
            const json = uri.toJSON();

            expect(json).toEqual({
                scheme: 'file',
                authority: '',
                path: '/docs/readme.md',
                query: '',
                fragment: '',
            });
        });

        it('应该可以从 JSON 还原', () => {
            const original = URI.parse('file:///docs/readme.md?v=1#intro');
            const json = original.toJSON();
            const restored = URI.from(json);

            expect(restored.isEqual(original)).toBe(true);
        });
    });

    describe('with 方法', () => {
        it('应该返回新实例', () => {
            const uri = URI.parse('file:///docs/readme.md');
            const newUri = uri.with({ query: 'version=2' });

            expect(newUri).not.toBe(uri);
            expect(newUri.toString()).toBe('file:///docs/readme.md?version=2');
        });

        it('应该保持原实例不变', () => {
            const uri = URI.parse('file:///docs/readme.md');
            uri.with({ query: 'version=2' });

            expect(uri.query).toBe('');
            expect(uri.toString()).toBe('file:///docs/readme.md');
        });

        it('应该更新单个组件', () => {
            const uri = URI.parse('file:///docs/readme.md');
            const newUri = uri.with({ query: 'version=2' });

            expect(newUri.scheme).toBe(uri.scheme);
            expect(newUri.path).toBe(uri.path);
            expect(newUri.query).toBe('version=2');
        });

        it('应该更新多个组件', () => {
            const uri = URI.parse('file:///docs/readme.md');
            const newUri = uri.with({ query: 'v=2', fragment: 'intro' });

            expect(newUri.query).toBe('v=2');
            expect(newUri.fragment).toBe('intro');
        });

        it('空更新应该返回相等的实例', () => {
            const uri = URI.parse('file:///docs/readme.md');
            const newUri = uri.with({});

            expect(uri.isEqual(newUri)).toBe(true);
        });
    });

    describe('isEqual 方法', () => {
        it('相同 URI 应该相等', () => {
            const uri1 = URI.parse('file:///docs/readme.md');
            const uri2 = URI.parse('file:///docs/readme.md');

            expect(uri1.isEqual(uri2)).toBe(true);
        });

        it('不同 URI 应该不相等', () => {
            const uri1 = URI.parse('file:///docs/readme.md');
            const uri2 = URI.parse('file:///docs/other.md');

            expect(uri1.isEqual(uri2)).toBe(false);
        });

        it('与 null 比较应该返回 false', () => {
            const uri = URI.parse('file:///docs/readme.md');

            expect(uri.isEqual(null)).toBe(false);
        });

        it('与 undefined 比较应该返回 false', () => {
            const uri = URI.parse('file:///docs/readme.md');

            expect(uri.isEqual(undefined)).toBe(false);
        });

        it('不同 scheme 应该不相等', () => {
            const uri1 = URI.parse('file:///docs/readme.md');
            const uri2 = URI.parse('idb://docs/readme.md');

            expect(uri1.isEqual(uri2)).toBe(false);
        });

        it('不同 query 应该不相等', () => {
            const uri1 = URI.parse('file:///docs/readme.md?v=1');
            const uri2 = URI.parse('file:///docs/readme.md?v=2');

            expect(uri1.isEqual(uri2)).toBe(false);
        });
    });

    describe('fsPath 属性', () => {
        it('应该返回文件系统路径', () => {
            const uri = URI.parse('file:///Users/project/docs/readme.md');

            expect(uri.fsPath).toBe('/Users/project/docs/readme.md');
        });

        it('应该返回正确的 path', () => {
            const uri = URI.file('/docs/readme.md');

            expect(uri.fsPath).toBe('/docs/readme.md');
        });
    });
});
