import type { UriJson } from './types';

/**
 * URI 类用于解析和序列化文件系统路径
 *
 * 设计目标:
 * - 路径解析：将 scheme://path 格式解析为结构化对象
 * - 资源标识：在系统内部传递文件资源
 * - 可序列化：支持 JSON 序列化和反序列化
 * - 不可变设计：URI 对象创建后不可修改
 */
export class URI {
    readonly scheme: string;
    readonly authority: string;
    readonly path: string;
    readonly query: string;
    readonly fragment: string;

    /**
     * 私有构造函数，通过静态方法创建实例
     */
    private constructor(
        scheme: string,
        authority: string,
        path: string,
        query: string,
        fragment: string,
    ) {
        this.scheme = scheme;
        this.authority = authority;
        this.path = path;
        this.query = query;
        this.fragment = fragment;
    }

    /**
     * 解析 URI 字符串为 URI 对象
     * @param value - URI 字符串，如 'file:///path/to/file' 或 'idb://authority/path'
     * @returns URI 实例
     * @throws 如果 URI 格式无效
     */
    static parse(value: string): URI {
        // 匹配 URI 格式：scheme://[authority]path[?query][#fragment]
        const regex = /^([a-z][a-z0-9+.-]*):\/\/([^/?#]*)(\/[^?#]*)?(?:\?([^#]*))?(?:#(.*))?$/i;
        const match = value.match(regex);

        if (!match) {
            throw new Error(`Invalid URI: ${value}`);
        }

        const [, scheme, authority, path, query, fragment] = match;

        // file:// scheme 通常没有 authority，路径从 /// 开始
        if (scheme === 'file' && authority === '') {
            // file:///path 格式，path 以 / 开头
            return new URI(scheme, '', path || '/', query || '', fragment || '');
        }

        return new URI(scheme.toLowerCase(), authority, path || '/', query || '', fragment || '');
    }

    /**
     * 从 UriJson 组件构建 URI 对象
     * @param components - UriJson 组件
     * @returns URI 实例
     */
    static from(components: UriJson): URI {
        return new URI(
            components.scheme,
            components.authority || '',
            components.path || '/',
            components.query || '',
            components.fragment || '',
        );
    }

    /**
     * 从文件系统路径创建 file:// URI
     * @param path - 文件系统路径
     * @returns URI 实例
     */
    static file(path: string): URI {
        return new URI('file', '', path, '', '');
    }

    /**
     * 类型守卫，判断未知对象是否为 URI 实例
     * @param obj - 待判断的对象
     * @returns 如果是 URI 实例返回 true
     */
    static isUri(obj: unknown): obj is URI {
        return obj instanceof URI;
    }

    /**
     * 将 URI 序列化为字符串
     * @returns URI 字符串
     */
    toString(): string {
        let result = `${this.scheme}://`;

        if (this.authority) {
            result += this.authority;
        }

        result += this.path;

        if (this.query) {
            result += `?${this.query}`;
        }

        if (this.fragment) {
            result += `#${this.fragment}`;
        }

        return result;
    }

    /**
     * 将 URI 序列化为 Json 对象
     * @returns UriJson 对象
     */
    toJSON(): UriJson {
        return {
            scheme: this.scheme,
            authority: this.authority,
            path: this.path,
            query: this.query,
            fragment: this.fragment,
        };
    }

    /**
     * 通过部分更新创建新的 URI 实例
     * @param changes - 要更新的组件
     * @returns 新的 URI 实例
     */
    with(changes: Partial<UriJson>): URI {
        return new URI(
            changes.scheme ?? this.scheme,
            changes.authority ?? this.authority,
            changes.path ?? this.path,
            changes.query ?? this.query,
            changes.fragment ?? this.fragment,
        );
    }

    /**
     * 比较两个 URI 是否相等
     * @param other - 另一个 URI 或 null/undefined
     * @returns 如果所有组件相同返回 true
     */
    isEqual(other: URI | null | undefined): boolean {
        if (!other) {
            return false;
        }

        return (
            this.scheme === other.scheme &&
            this.authority === other.authority &&
            this.path === other.path &&
            this.query === other.query &&
            this.fragment === other.fragment
        );
    }

    /**
     * 获取文件系统路径
     * 仅适用于 file:// scheme
     * @returns 文件系统路径
     */
    get fsPath(): string {
        return this.path;
    }
}
