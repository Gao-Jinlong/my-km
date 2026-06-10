/**
 * NestJS 自定义 webpack 配置
 *
 * 【为什么需要这个文件】
 * NestJS webpack builder 默认使用 `webpack-node-externals` 将所有 node_modules
 * 排除在打包之外（作为外部依赖）。但 Prisma 7 生成的客户端代码使用无扩展名的
 * ESM 导入（如 `./internal/class`），Node.js 无法在运行时直接解析。
 *
 * 【解决方案】
 * 将 `@my-km/prisma` 和 `@prisma/adapter-pg` 加入 externals 白名单，
 * 让 webpack 将它们打包进 server 产物中，由 webpack 处理模块解析。
 *
 * 【server tsconfig 改动说明】
 * - module: "nodenext" → "ESNext"
 * - moduleResolution: "nodenext" → "bundler"
 *
 * Prisma 7 生成的代码使用无扩展名相对导入（如 `./internal/class`），
 * `moduleResolution: "nodenext"` 会解析失败（要求扩展名），
 * 而 `"bundler"` 允许无扩展名导入，且对 webpack 项目来说更合适
 * （webpack 处理实际打包，TypeScript 只负责类型检查）。
 */
const nodeExternals = require('webpack-node-externals');

module.exports = options => ({
    ...options,
    externals: [
        nodeExternals({
            allowlist: ['@my-km/prisma', '@prisma/adapter-pg'],
        }),
    ],
});
