import type { PrismaService } from '../../prisma/prisma.service';

/** PG Run 行类型（Prisma 推断，避免直接依赖 generated 路径） */
export type RunRow = NonNullable<Awaited<ReturnType<PrismaService['run']['findUnique']>>>;

/** 租约抢占失败时的诊断信息 */
export interface LeaseConflict {
    ownerId: string | null;
    leaseUntil: Date | null;
}

export interface LeaseAcquired {
    acquired: true;
    run: RunRow;
    conflict: null;
}

export interface LeaseDenied {
    acquired: false;
    run: null;
    conflict: LeaseConflict | null;
}

/** acquireLease 返回值：成功携带 run 行，失败携带冲突诊断 */
export type LeaseResult = LeaseAcquired | LeaseDenied;
