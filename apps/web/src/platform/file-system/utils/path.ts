import { ParsedPath } from '../types';
import { InvalidPathError } from '../errors';

/**
 * 解析 URI 路径为结构化对象
 *
 * @param uri - URI 字符串，格式：{scheme}://{authority}{path}
 * @returns 解析后的路径对象
 * @throws InvalidPathError 当 URI 格式无效时
 *
 * @example
 * parsePath('memory://docs/test.md') // { scheme: 'memory', authority: '', path: 'docs/test.md' }
 * parsePath('idb://project-123/files/test.md') // { scheme: 'idb', authority: 'project-123', path: '/files/test.md' }
 * parsePath('file:///Users/project/docs/test.md') // { scheme: 'file', authority: '', path: '/Users/project/docs/test.md' }
 */
export function parsePath(uri: string): ParsedPath {
    if (!uri || typeof uri !== 'string') {
        throw new InvalidPathError(uri || 'empty', 'URI 不能为空');
    }

    // 匹配 scheme://rest 格式
    const match = uri.match(/^([a-z][a-z0-9+.-]*):\/\/(.*)$/i);

    if (!match) {
        throw new InvalidPathError(uri, '无效的 URI 格式，期望格式：scheme://authority/path');
    }

    const [, scheme, rest] = match;

    // memory 和 file scheme 通常没有 authority
    // idb 等 scheme 有 authority（如项目 ID）
    const noAuthoritySchemes = ['memory', 'file'];
    const hasNoAuthority = noAuthoritySchemes.includes(scheme.toLowerCase());

    if (hasNoAuthority) {
        return {
            scheme: scheme.toLowerCase(),
            authority: '',
            path: rest || '/',
        };
    }

    // 对于有 authority 的 scheme，查找第一个 / 分隔符
    const slashIndex = rest.indexOf('/');
    if (slashIndex === -1) {
        // 没有 /，整个 rest 是 authority，path 为 /
        return {
            scheme: scheme.toLowerCase(),
            authority: rest,
            path: '/',
        };
    }

    // 有 /，分割 authority 和 path
    const authority = rest.substring(0, slashIndex);
    const path = rest.substring(slashIndex);

    return {
        scheme: scheme.toLowerCase(),
        authority: authority || '',
        path: path || '/',
    };
}

/**
 * 规范化路径 - 移除重复斜杠、解析相对路径
 *
 * @param path - 要规范化的路径
 * @returns 规范化后的路径
 *
 * @example
 * normalize('/docs//subdir///test.md') // '/docs/subdir/test.md'
 * normalize('/docs/../src/index.ts') // '/src/index.ts'
 * normalize('/docs/./test.md') // '/docs/test.md'
 */
export function normalize(path: string): string {
    if (!path) {
        return '/';
    }

    // 保留开头的斜杠
    const isAbsolute = path.startsWith('/');

    // 分割路径段
    const segments = path.split('/').filter(segment => segment !== '' && segment !== '.');

    // 解析 '..'
    const result: string[] = [];
    for (const segment of segments) {
        if (segment === '..') {
            if (result.length > 0) {
                result.pop();
            }
        } else {
            result.push(segment);
        }
    }

    const normalized = result.join('/');
    return isAbsolute ? `/${normalized}` : normalized;
}

/**
 * 连接路径段
 *
 * @param base - 基础路径
 * @param segments - 要连接的路径段
 * @returns 连接后的路径
 *
 * @example
 * join('/docs', 'test.md') // '/docs/test.md'
 * join('/projects', 'my-project', 'src', 'index.ts') // '/projects/my-project/src/index.ts'
 */
export function join(base: string, ...segments: string[]): string {
    const allSegments = [base, ...segments].filter(s => s !== '');

    if (allSegments.length === 0) {
        return '/';
    }

    const isAbsolute = allSegments[0].startsWith('/');
    const normalizedSegments = allSegments
        .map(s => s.replace(/^\/|\/$/g, '')) // 移除首尾斜杠
        .filter(s => s !== '');

    const result = normalizedSegments.join('/');
    return isAbsolute ? `/${result}` : result;
}

/**
 * 获取路径的目录名
 *
 * @param path - 文件路径
 * @returns 目录路径
 *
 * @example
 * dirname('/docs/test.md') // '/docs'
 * dirname('/docs/') // '/docs'
 * dirname('/') // '/'
 */
export function dirname(path: string): string {
    if (!path || path === '/') {
        return '/';
    }

    // 移除末尾斜杠
    const normalized = path.replace(/\/+$/, '');

    // 如果移除后为空，说明是根目录
    if (normalized === '') {
        return '/';
    }

    const lastSlashIndex = normalized.lastIndexOf('/');

    if (lastSlashIndex === -1) {
        return '.';
    }

    if (lastSlashIndex === 0) {
        // 根目录下的直接子项，如 '/docs'，返回 '/'
        // 但如果原路径以斜杠结尾，如 '/docs/'，返回 '/docs'
        if (path.endsWith('/') && normalized.length > 0) {
            return normalized;
        }
        return '/';
    }

    return normalized.substring(0, lastSlashIndex);
}

/**
 * 获取路径的文件名
 *
 * @param path - 文件路径
 * @returns 文件名
 *
 * @example
 * basename('/docs/test.md') // 'test.md'
 * basename('/docs/') // 'docs'
 */
export function basename(path: string): string {
    if (!path || path === '/') {
        return '';
    }

    // 移除末尾斜杠
    const normalized = path.replace(/\/$/, '');
    const lastSlashIndex = normalized.lastIndexOf('/');

    if (lastSlashIndex === -1) {
        return path;
    }

    return normalized.substring(lastSlashIndex + 1);
}

/**
 * 获取路径的扩展名
 *
 * @param path - 文件路径
 * @returns 扩展名（包含点）
 *
 * @example
 * extname('/docs/test.md') // '.md'
 * extname('/docs/test.min.js') // '.js'
 * extname('/docs/README') // ''
 */
export function extname(path: string): string {
    const name = basename(path);
    const dotIndex = name.lastIndexOf('.');

    if (dotIndex === -1 || dotIndex === 0) {
        return '';
    }

    return name.substring(dotIndex);
}

/**
 * 判断路径是否为绝对路径
 *
 * @param path - 要判断的路径
 * @returns 是否为绝对路径
 */
export function isAbsolute(path: string): boolean {
    return path.startsWith('/');
}

/**
 * 判断路径是否为相对路径
 *
 * @param path - 要判断的路径
 * @returns 是否为相对路径
 */
export function isRelative(path: string): boolean {
    return !path.startsWith('/') && !path.includes('://');
}

/**
 * 获取相对路径
 *
 * @param from - 起始路径
 * @param to - 目标路径
 * @returns 相对路径
 */
export function relative(from: string, to: string): string {
    // 判断 from 是否是文件（有扩展名）
    const fromIsFile = from.includes('.') && !from.endsWith('/');

    // 如果 from 是文件，使用其目录作为起点
    const fromPath = fromIsFile ? dirname(from) : from;

    // 将 fromPath 和 to 转换为路径段数组
    const fromSegments = fromPath.split('/').filter(s => s !== '');
    const toSegments = to.split('/').filter(s => s !== '');

    // 找到共同前缀长度
    let commonLength = 0;
    for (let i = 0; i < Math.min(fromSegments.length, toSegments.length); i++) {
        if (fromSegments[i] === toSegments[i]) {
            commonLength++;
        } else {
            break;
        }
    }

    // 计算需要向上多少层
    const upCount = fromSegments.length - commonLength;
    // 获取目标路径中需要向下的段
    const downSegments = toSegments.slice(commonLength);

    // 构建相对路径
    const parts = [...Array(upCount).fill('..'), ...downSegments];
    const result = parts.join('/');
    return result || '.';
}
