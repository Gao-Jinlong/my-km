/**
 * Jest manual mock for @my-km/prisma.
 *
 * Prisma 7 generated client 使用 import.meta（ESM），在 Jest CJS 环境无法加载。
 * 单元测试不需要真实 Prisma（PrismaService 在测试里被 useValue mock），
 * 这里提供可被 extends 的空 class，切断 generated client 的 import 链。
 *
 * 生产代码（非测试）仍 import 真实 @my-km/prisma；此 mock 仅 Jest 生效。
 */
export class PrismaClient {
    constructor(_args?: unknown) {}
    async $connect(): Promise<void> {}
    async $disconnect(): Promise<void> {}
}

export class PrismaPg {
    constructor(_options: { connectionString?: string }) {}
}
