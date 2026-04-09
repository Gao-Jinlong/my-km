import type { Block } from './block';

/**
 * 操作类型定义
 */
export type OperationType = 'insert-block' | 'delete-block' | 'update-block' | 'move-block';

/**
 * 文档操作日志接口
 * 用于记录文档的变更历史
 */
export interface Operation {
    type: OperationType;
    timestamp: string; // ISO 8601 格式
    blockId: string;
    data: Record<string, any>;
}

/**
 * 文档类型
 */
export type DocumentType = 'rich-text' | 'markdown' | 'km';

/**
 * 文档接口
 * 表示一个完整的文档实体
 */
export interface Document {
    id: string; // 格式：doc-xxxxx (nanoid)
    path: string; // 文件路径
    title: string;
    type: DocumentType;
    content: Block[];
    version: number;
    createdAt: string; // ISO 8601 格式
    updatedAt: string; // ISO 8601 格式
    operations?: Operation[]; // 预留操作日志
}
