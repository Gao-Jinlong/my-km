/**
 * URI 的 JSON 表示格式，用于序列化和反序列化
 */
export interface UriJson {
    scheme: string;
    authority: string;
    path: string;
    query: string;
    fragment: string;
}
