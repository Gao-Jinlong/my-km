/**
 * 文件类型图标映射工具
 *
 * 根据文件扩展名返回对应的 lucide-react 图标
 * 与文件树面板使用一致的图标风格
 */

import {
    File,
    FileArchive,
    FileAudio,
    FileCode,
    FileHeart,
    FileImage,
    FileJson,
    FileSpreadsheet,
    FileText,
    FileType,
    FileVideo,
    type LucideIcon,
} from 'lucide-react';

/**
 * 文件类型分类
 */
const FILE_TYPE_MAP: Record<string, LucideIcon> = {
    // 代码文件
    ts: FileCode,
    tsx: FileCode,
    js: FileCode,
    jsx: FileCode,
    py: FileCode,
    go: FileCode,
    rs: FileCode,
    java: FileCode,
    c: FileCode,
    cpp: FileCode,
    h: FileCode,
    hpp: FileCode,
    cs: FileCode,
    php: FileCode,
    rb: FileCode,
    swift: FileCode,
    kt: FileCode,
    scala: FileCode,
    sh: FileCode,
    bash: FileCode,
    zsh: FileCode,
    fish: FileCode,
    sql: FileCode,
    graphql: FileCode,
    prisma: FileCode,
    vue: FileCode,
    svelte: FileCode,
    astro: FileCode,
    mdx: FileCode,

    // 样式文件
    css: FileCode,
    scss: FileCode,
    sass: FileCode,
    less: FileCode,
    styl: FileCode,
    tailwind: FileCode,

    // 配置文件
    json: FileJson,
    jsonc: FileJson,
    yaml: FileText,
    yml: FileText,
    toml: FileText,
    xml: FileText,
    env: FileText,
    gitignore: FileText,
    editorconfig: FileText,
    eslint: FileText,
    prettierrc: FileText,
    babelrc: FileText,
    tsconfig: FileText,
    jsconfig: FileText,
    vite: FileText,
    webpack: FileText,
    rollup: FileText,

    // 文档文件
    txt: FileText,
    md: FileText,
    markdown: FileText,
    rtf: FileText,
    doc: FileText,
    docx: FileText,
    pdf: FileText,

    // 图片文件
    png: FileImage,
    jpg: FileImage,
    jpeg: FileImage,
    gif: FileImage,
    svg: FileImage,
    webp: FileImage,
    ico: FileImage,
    bmp: FileImage,
    avif: FileImage,

    // 视频文件
    mp4: FileVideo,
    webm: FileVideo,
    ogv: FileVideo,
    mov: FileVideo,
    avi: FileVideo,
    mkv: FileVideo,

    // 音频文件
    mp3: FileAudio,
    wav: FileAudio,
    ogg: FileAudio,
    flac: FileAudio,
    m4a: FileAudio,

    // 压缩文件
    zip: FileArchive,
    rar: FileArchive,
    '7z': FileArchive,
    tar: FileArchive,
    gz: FileArchive,
    xz: FileArchive,

    // 数据文件
    csv: FileSpreadsheet,
    xls: FileSpreadsheet,
    xlsx: FileSpreadsheet,
    db: FileSpreadsheet,
    sqlite: FileSpreadsheet,

    // 特殊文件
    license: FileHeart,
    readme: FileText,
    changelog: FileText,
    contributing: FileText,
};

/**
 * 常见文件名模式匹配
 */
const FILENAME_PATTERNS: Array<{ pattern: RegExp; icon: LucideIcon }> = [
    { pattern: /^package\.json$/i, icon: FileJson },
    { pattern: /^tsconfig\./i, icon: FileType },
    { pattern: /^jsconfig\./i, icon: FileType },
    { pattern: /^vite\./i, icon: FileType },
    { pattern: /^webpack\./i, icon: FileType },
    { pattern: /^rollup\./i, icon: FileType },
    { pattern: /^eslint\./i, icon: FileType },
    { pattern: /^prettier\./i, icon: FileType },
    { pattern: /^babel\./i, icon: FileType },
    { pattern: /^\.env/i, icon: FileText },
    { pattern: /^gitignore$/i, icon: FileText },
    { pattern: /^editorconfig$/i, icon: FileText },
    { pattern: /^license$/i, icon: FileHeart },
    { pattern: /^readme/i, icon: FileText },
    { pattern: /^changelog/i, icon: FileText },
    { pattern: /^contributing/i, icon: FileText },
];

export interface FileIconOptions {
    /** 文件路径或文件名 */
    path: string;
    /** 图标大小，默认 14 (h-3.5 w-3.5) */
    size?: number;
    /** 图标颜色类名 */
    className?: string;
}

/**
 * 根据文件路径/名称获取对应的图标组件
 *
 * @example
 * const Icon = getFileIcon('src/App.tsx');
 * return <Icon className="h-3.5 w-3.5" />;
 *
 * @example
 * const { Icon, props } = getFileIconComponent({ path: 'data.json' });
 * return <Icon {...props} />;
 */
export function getFileIcon(path: string): LucideIcon {
    const fileName = path.split('/').pop() || path.split('\\').pop() || path;
    const lowerFileName = fileName.toLowerCase();

    // 检查文件名模式匹配（用于 package.json, .env 等特殊文件）
    for (const { pattern, icon } of FILENAME_PATTERNS) {
        if (pattern.test(lowerFileName)) {
            return icon;
        }
    }

    // 获取文件扩展名（去掉开头的点）
    const ext = lowerFileName.includes('.') ? lowerFileName.split('.').pop()?.replace('.', '') : '';

    if (!ext) {
        // 没有扩展名，返回默认图标
        return File;
    }

    // 返回对应扩展名的图标，如果没有匹配则返回默认 File 图标
    return FILE_TYPE_MAP[ext] || File;
}

/**
 * 获取文件图标组件及其属性
 * 返回包含图标组件和推荐属性的对象
 */
export function getFileIconComponent({
    path,
    size = 14,
    className = 'text-ws-icon',
}: FileIconOptions): {
    Icon: LucideIcon;
    props: { className: string; size: number };
} {
    const Icon = getFileIcon(path);
    return {
        Icon,
        props: {
            className,
            size,
        },
    };
}

/**
 * 获取文件的扩展名显示文本
 * 用于在标签页显示文件类型后缀
 *
 * @example
 * getExtensionDisplay('src/App.tsx') // 'TSX'
 * getExtensionDisplay('data.json') // 'JSON'
 */
export function getExtensionDisplay(path: string): string {
    const fileName = path.split('/').pop() || path.split('\\').pop() || path;
    const parts = fileName.split('.');

    if (parts.length < 2) {
        return '';
    }

    const ext = parts[parts.length - 1];

    // 常见扩展名保持大写，其他转大写
    const uppercaseExts = ['ts', 'tsx', 'js', 'jsx', 'css', 'html', 'json', 'md', 'py', 'go', 'rs'];

    if (uppercaseExts.includes(ext.toLowerCase())) {
        return ext.toUpperCase();
    }

    return ext.toLowerCase();
}
