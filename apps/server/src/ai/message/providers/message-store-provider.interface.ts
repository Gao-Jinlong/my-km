import type { CreateMessageInput, FindByRoomOptions, MessageRecord } from '../message-store.types';

/**
 * MessageStoreProvider — 存储层抽象接口。
 * 只做纯 CRUD 操作，不关心消息格式转换、内存管理或事务语义。
 *
 * 实现此接口即可作为 MessageStore 的存储后端。
 * 当前提供: PrismaMessageStoreProvider, JsonlMessageStoreProvider
 */
export interface MessageStoreProvider {
    /**
     * 创建单条消息
     */
    create(record: CreateMessageInput): Promise<MessageRecord>;

    /**
     * 批量创建（要求事务语义 — Prisma 用 $transaction，JSONL 逐条追加）
     */
    createMany(records: CreateMessageInput[]): Promise<MessageRecord[]>;

    /**
     * 查询房间消息
     */
    findByRoom(roomId: string, opts?: FindByRoomOptions): Promise<MessageRecord[]>;

    /**
     * 聚合 token 使用量
     */
    aggregateTokens(roomId: string): Promise<number>;

    /**
     * 可选：健康检查（用于启动时验证 Provider 可用）
     */
    healthCheck?(): Promise<boolean>;
}

/**
 * NestJS 注入 Token — 用于 Symbol 方式注入 Provider
 */
export const MESSAGE_STORE_PROVIDER_TOKEN = Symbol('MESSAGE_STORE_PROVIDER');
