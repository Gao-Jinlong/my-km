/**
 * REPLICA_ID — 当前后端副本的唯一标识。
 *
 * 多副本下每个进程实例一个；用于 Run.ownerId 租约归属。
 * 来源：env AI_REPLICA_ID（部署时显式指定），否则进程启动随机生成（单进程足够）。
 */
export const REPLICA_ID = Symbol('REPLICA_ID');
