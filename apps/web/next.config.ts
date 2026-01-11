import path from 'node:path';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
    // 配置 transpilePackages 以支持 monorepo 中的本地包
    transpilePackages: ['shared'],

    // 配置输出目录
    distDir: '.next',

    // 实验性功能
    experimental: {
        // 启用 React Compiler (可选)
        // reactCompiler: true,
    },
    turbopack: {
        // 设置为 monorepo 根目录,以便 Turbopack 能正确解析 pnpm 的符号链接
        root: path.resolve('../../'),
    },
};

export default nextConfig;
