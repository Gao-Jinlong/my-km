/**
 * Prisma 7 wrapper 包入口
 *
 * 【为什么不需要 tsc 编译】
 * Prisma 7 生成的代码（generated/）内部使用无扩展名的相对导入（如 `./internal/class`），
 * 且头部的 `@ts-nocheck` 会导致 tsc 跳过类型生成，`.d.ts` 类型链断裂。
 * 因此这个 wrapper 包不经过 tsc 编译，直接由消费方（webpack）处理源码。
 *
 * 【为什么用 .js 扩展名】
 * TypeScript 的 `moduleResolution: "bundler"` 要求相对导入带 `.js` 扩展名，
 * 即使实际文件是 `.ts`，bundler 解析会自动映射 `.js` → `.ts`。
 *
 * 【为什么没有 "type": "module"】
 * 设了 `type: "module"` 后，webpack 会以 strict ESM 模式解析 `.js` 文件，
 * 要求所有导入带完整扩展名，与 Prisma 生成的无扩展名导入冲突。
 * 不设的话 webpack 按普通脚本处理，能正确解析。
 *
 * 【为什么导出 PrismaPg】
 * Prisma 7 要求 PrismaClient 构造时必须传入 driver adapter。
 * PrismaPg 是 PostgreSQL 的 adapter，集中导出方便消费方使用。
 */

export { PrismaPg } from '@prisma/adapter-pg';
export * from '../generated/client';
