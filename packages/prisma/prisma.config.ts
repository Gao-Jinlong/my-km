/**
 * Prisma 7 CLI 配置
 *
 * 【替代了 schema.prisma 中的 datasource 配置】
 * Prisma 7 将 `url`、`directUrl`、`shadowDatabaseUrl` 从 schema.prisma
 * 的 datasource 块中移除，统一在此文件配置。
 *
 * 【engine 字段已移除】
 * Prisma 7 使用纯 TypeScript 引擎，不再有 Rust 引擎选项，
 * 不需要（也不能）设置 `engine: 'classic'`。
 *
 * 【环境变量需要手动加载】
 * Prisma 7 不再自动加载 .env 文件，需要 `import 'dotenv/config'` 手动加载。
 * `env()` 是类型安全的环境变量读取辅助函数。
 */
import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';

export default defineConfig({
    schema: 'prisma/schema.prisma',
    migrations: {
        path: 'prisma/migrations',
    },
    datasource: {
        url: env('DATABASE_URL'),
    },
});
