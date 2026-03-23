import { describe, expect, it } from 'vitest';
import { InvalidPathError } from '../errors';
import {
    basename,
    dirname,
    extname,
    isAbsolute,
    isRelative,
    join,
    normalize,
    parsePath,
    relative,
} from '../utils/path';

describe('path utils', () => {
    describe('parsePath', () => {
        it('应该正确解析 memory:// 路径', () => {
            const result = parsePath('memory://docs/test.md');
            expect(result).toEqual({
                scheme: 'memory',
                authority: '',
                path: 'docs/test.md',
            });
        });

        it('应该正确解析 idb:// 路径', () => {
            const result = parsePath('idb://project-123/files/test.md');
            expect(result).toEqual({
                scheme: 'idb',
                authority: 'project-123',
                path: '/files/test.md',
            });
        });

        it('应该正确解析 file:// 路径', () => {
            const result = parsePath('file:///Users/project/docs/test.md');
            expect(result).toEqual({
                scheme: 'file',
                authority: '',
                path: '/Users/project/docs/test.md',
            });
        });

        it('应该在 URI 为空时抛出错误', () => {
            expect(() => parsePath('')).toThrow(InvalidPathError);
        });

        it('应该在 URI 格式无效时抛出错误', () => {
            expect(() => parsePath('invalid-uri')).toThrow(InvalidPathError);
        });
    });

    describe('normalize', () => {
        it('应该移除重复的斜杠', () => {
            expect(normalize('/docs//subdir///test.md')).toBe('/docs/subdir/test.md');
        });

        it('应该解析相对路径 ..', () => {
            expect(normalize('/docs/../src/index.ts')).toBe('/src/index.ts');
        });

        it('应该解析当前目录 .', () => {
            expect(normalize('/docs/./test.md')).toBe('/docs/test.md');
        });

        it('应该处理空路径', () => {
            expect(normalize('')).toBe('/');
        });

        it('应该处理多个 ..', () => {
            expect(normalize('/a/b/c/../../d')).toBe('/a/d');
        });
    });

    describe('join', () => {
        it('应该连接两个路径', () => {
            expect(join('/docs', 'test.md')).toBe('/docs/test.md');
        });

        it('应该连接多个路径段', () => {
            expect(join('/projects', 'my-project', 'src', 'index.ts')).toBe(
                '/projects/my-project/src/index.ts',
            );
        });

        it('应该处理空路径', () => {
            expect(join('', 'test.md')).toBe('test.md');
        });

        it('应该移除首尾斜杠', () => {
            expect(join('/docs/', '/test.md')).toBe('/docs/test.md');
        });
    });

    describe('dirname', () => {
        it('应该获取文件目录名', () => {
            expect(dirname('/docs/test.md')).toBe('/docs');
        });

        it('应该处理根路径', () => {
            expect(dirname('/')).toBe('/');
        });

        it('应该处理带斜杠的路径', () => {
            expect(dirname('/docs/')).toBe('/docs');
        });

        it('应该处理单层路径', () => {
            expect(dirname('/docs')).toBe('/');
        });
    });

    describe('basename', () => {
        it('应该获取文件名', () => {
            expect(basename('/docs/test.md')).toBe('test.md');
        });

        it('应该处理目录路径', () => {
            expect(basename('/docs/')).toBe('docs');
        });

        it('应该处理根路径', () => {
            expect(basename('/')).toBe('');
        });
    });

    describe('extname', () => {
        it('应该获取扩展名', () => {
            expect(extname('/docs/test.md')).toBe('.md');
        });

        it('应该处理多点文件名', () => {
            expect(extname('/docs/test.min.js')).toBe('.js');
        });

        it('应该处理无扩展名文件', () => {
            expect(extname('/docs/README')).toBe('');
        });

        it('应该处理以点开头的文件', () => {
            expect(extname('/docs/.gitignore')).toBe('');
        });
    });

    describe('isAbsolute', () => {
        it('应该识别绝对路径', () => {
            expect(isAbsolute('/docs/test.md')).toBe(true);
        });

        it('应该识别相对路径', () => {
            expect(isAbsolute('docs/test.md')).toBe(false);
        });
    });

    describe('isRelative', () => {
        it('应该识别相对路径', () => {
            expect(isRelative('docs/test.md')).toBe(true);
        });

        it('应该识别绝对路径', () => {
            expect(isRelative('/docs/test.md')).toBe(false);
        });

        it('应该识别协议路径', () => {
            expect(isRelative('memory://test.md')).toBe(false);
        });
    });

    describe('relative', () => {
        it('应该计算相对路径', () => {
            expect(relative('/a/b/c', '/a/b/d')).toBe('../d');
        });

        it('应该处理相同目录', () => {
            expect(relative('/a/b/file.txt', '/a/b/other.txt')).toBe('other.txt');
        });

        it('应该处理多层目录', () => {
            expect(relative('/a/b/c/d/e', '/a/x/y')).toBe('../../../../x/y');
        });
    });
});
