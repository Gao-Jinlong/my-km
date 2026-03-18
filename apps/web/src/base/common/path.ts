export interface ParsedPath {
    root: string;
    dir: string;
    base: string;
    ext: string;
    name: string;
}

export interface IPath {
    normalize(path: string): string;
    isAbsolute(path: string): boolean;
    join(...paths: string[]): string;
    resolve(...pathSegments: string[]): string;
    relative(from: string, to: string): string;
    dirname(path: string): string;
    basename(path: string, suffix?: string): string;
    extname(path: string): string;
    format(pathObject: ParsedPath): string;
    parse(path: string): ParsedPath;
    toNamespacedPath(path: string): string;
    sep: '\\' | '/';
    delimiter: string;
    win32: IPath | null;
    posix: IPath | null;
}

const paths: IPath = {
    join: (...paths: string[]) => paths.join('/'),
    // normalize: (path: string) => path,
    // isAbsolute: (path: string) => path.startsWith('/'),
};

export default paths;
