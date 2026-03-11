import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src'),
            '@/components': path.resolve(__dirname, './src/components'),
            '@/lib': path.resolve(__dirname, './src/lib'),
            '@workspace/shared': path.resolve(__dirname, '../packages/shared/src'),
        },
    },
    test: {
        // 测试文件匹配模式
        include: ['**/*.test.ts', '**/*.test.tsx'],
        // 测试环境
        environment: 'jsdom',
        // 全局测试设置文件
        setupFiles: ['./src/__tests__/setup.ts'],
        // 全局测试 API
        globals: true,
        // 测试超时时间
        testTimeout: 5000,
        // 覆盖率配置
        coverage: {
            provider: 'v8',
            reporter: ['text', 'json', 'html'],
            include: ['src/**/*.{ts,tsx}'],
            exclude: ['src/**/*.d.ts', 'src/**/__tests__/**', 'src/**/*.test.{ts,tsx}'],
        },
    },
});
