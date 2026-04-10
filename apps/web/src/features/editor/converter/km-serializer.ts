/**
 * .km 文件格式序列化/反序列化工具
 *
 * .km 文件是 Knowledge Markdown 的专有文件格式，用于无损存储 Block[] 结构
 * 文件格式：JSON + 元数据
 */

import { container } from '@/platform/bootstrap';
import { LoggerService } from '@/platform/logger/service';

import type { Block } from '../types/block';

const logger = container.get(LoggerService).getLogger('km-serializer');

/**
 * .km 文件元数据
 */
export interface KmFileMetadata {
    /** 文件格式版本 */
    version: string;
    /** 创建时间 */
    createdAt: string;
    /** 最后修改时间 */
    updatedAt: string;
    /** 文档标题 */
    title?: string;
    /** 自定义元数据 */
    // biome-ignore lint/suspicious/noExplicitAny: 自定义元数据需要灵活类型
    custom?: Record<string, any>;
}

/**
 * .km 文件内容结构
 */
export interface KmFileContent {
    /** 元数据 */
    metadata: KmFileMetadata;
    /** 文档内容（Block[] 数组） */
    content: Block[];
}

/**
 * 当前 .km 文件格式版本
 */
export const KM_FILE_VERSION = '1.0.0';

/**
 * 将 Block[] 序列化为.km 文件格式
 *
 * @param blocks Block[] 数组
 * @param metadata 元数据
 * @returns .km 文件内容（JSON 字符串）
 */
export function serializeToKmFile(blocks: Block[], metadata: Partial<KmFileMetadata>): string {
    const kmContent: KmFileContent = {
        metadata: {
            version: KM_FILE_VERSION,
            createdAt: metadata.createdAt || new Date().toISOString(),
            updatedAt: metadata.updatedAt || new Date().toISOString(),
            title: metadata.title,
            custom: metadata.custom,
        },
        content: blocks,
    };

    return JSON.stringify(kmContent, null, 2);
}

/**
 * 从.km 文件内容反序列化为 Block[]
 *
 * @param content .km 文件内容（JSON 字符串）
 * @returns 反序列化后的 Block[] 和元数据
 * @throws Error 当文件格式无效时
 */
export function deserializeFromKmFile(content: string): {
    blocks: Block[];
    metadata: KmFileMetadata;
} {
    // 处理空文件或空内容
    if (!content || content.trim() === '') {
        const emptyMetadata: KmFileMetadata = {
            version: KM_FILE_VERSION,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        };
        return {
            blocks: [],
            metadata: emptyMetadata,
        };
    }

    try {
        const parsed = JSON.parse(content) as KmFileContent;

        // 验证格式
        if (!parsed.metadata || !parsed.content) {
            throw new Error('Invalid .km file format: missing metadata or content');
        }

        // 验证版本
        const majorVersion = parsed.metadata.version.split('.')[0];
        const expectedMajor = KM_FILE_VERSION.split('.')[0];
        if (majorVersion !== expectedMajor) {
            logger.warn(
                `.km file version mismatch: expected ${KM_FILE_VERSION}, got ${parsed.metadata.version}`,
            );
        }

        return {
            blocks: parsed.content,
            metadata: parsed.metadata,
        };
    } catch (error) {
        if (error instanceof SyntaxError) {
            throw new Error(`Invalid .km file JSON: ${error.message}`);
        }
        throw error;
    }
}

/**
 * 检查文件内容是否为.km 格式
 *
 * @param content 文件内容
 * @returns 是否为.km 格式
 */
export function isKmFileContent(content: string): boolean {
    try {
        const parsed = JSON.parse(content);
        return (
            parsed.metadata !== undefined &&
            parsed.content !== undefined &&
            Array.isArray(parsed.content)
        );
    } catch {
        return false;
    }
}
