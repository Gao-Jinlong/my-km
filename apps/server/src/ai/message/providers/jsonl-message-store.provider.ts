/**
 * JsonlMessageStoreProvider — 本地 JSONL 文件存储实现。
 *
 * 每条消息作为一行 JSON 追加到 roomId.jsonl 文件中。
 * 适用于开发/测试环境，或无数据库的部署场景。
 *
 * 注意：JSONL 没有 ACID 保证，createMany 逐条追加，
 * 如果中途失败可能导致部分写入。生产环境建议使用 PrismaProvider。
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { Injectable, Logger } from '@nestjs/common';
import type { CreateMessageInput, FindByRoomOptions, MessageRecord } from '../message-store.types';
import type { MessageStoreProvider } from './message-store-provider.interface';

@Injectable()
export class JsonlMessageStoreProvider implements MessageStoreProvider {
    private readonly logger = new Logger(JsonlMessageStoreProvider.name);
    private baseDir: string;

    constructor(config: { dataDir: string }) {
        this.baseDir = path.join(config.dataDir, 'messages');
    }

    /**
     * 初始化：确保存储目录存在
     */
    async init(): Promise<void> {
        await fs.mkdir(this.baseDir, { recursive: true });
    }

    private _filePath(roomId: string): string {
        return path.join(this.baseDir, `${roomId}.jsonl`);
    }

    async create(record: CreateMessageInput): Promise<MessageRecord> {
        const entry: MessageRecord = {
            ...record,
            id: crypto.randomUUID(),
            createdAt: new Date(),
        };
        const line = JSON.stringify(entry) + '\n';
        await fs.mkdir(path.dirname(this._filePath(record.roomId)), { recursive: true });
        await fs.appendFile(this._filePath(record.roomId), line, 'utf-8');
        return entry;
    }

    async createMany(records: CreateMessageInput[]): Promise<MessageRecord[]> {
        const results: MessageRecord[] = [];
        for (const record of records) {
            results.push(await this.create(record));
        }
        return results;
    }

    async findByRoom(roomId: string, opts: FindByRoomOptions = {}): Promise<MessageRecord[]> {
        const file = this._filePath(roomId);
        try {
            const content = await fs.readFile(file, 'utf-8');
            const records = this._parseLines(content);
            return this._applyOptions(records, opts);
        } catch (err) {
            if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
                return [];
            }
            this.logger.error(`Failed to read JSONL file for room ${roomId}: ${err}`);
            throw err;
        }
    }

    async aggregateTokens(roomId: string): Promise<number> {
        const records = await this.findByRoom(roomId);
        return records.reduce((sum, r) => sum + (r.tokenCount ?? 0), 0);
    }

    async healthCheck(): Promise<boolean> {
        try {
            await fs.mkdir(this.baseDir, { recursive: true });
            await fs.access(this.baseDir, fs.constants.W_OK);
            return true;
        } catch {
            return false;
        }
    }

    // ========== 私有方法 ==========

    /**
     * 解析 JSONL 内容，跳过无效行
     */
    private _parseLines(content: string): MessageRecord[] {
        return content
            .trim()
            .split('\n')
            .filter(Boolean)
            .map((line, idx) => {
                try {
                    return JSON.parse(line) as MessageRecord;
                } catch {
                    this.logger.warn(`Skipping invalid JSONL line ${idx + 1}`);
                    return null;
                }
            })
            .filter((r): r is MessageRecord => r !== null);
    }

    /**
     * 应用查询选项（limit / offset / orderBy）
     */
    private _applyOptions(records: MessageRecord[], opts: FindByRoomOptions): MessageRecord[] {
        let result = records;
        if (opts.orderBy === 'desc') {
            result = [...result].reverse();
        }
        if (opts.offset) {
            result = result.slice(opts.offset);
        }
        if (opts.limit !== undefined) {
            result = result.slice(0, opts.limit);
        }
        return result;
    }
}
