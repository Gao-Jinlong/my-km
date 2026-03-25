/**
 * BlockRegistry - 块类型注册中心
 *
 * 负责注册、验证和创建块实例
 */

import type { BaseBlock, BlockType } from '../types/block';

/**
 * 块类别枚举
 */
export enum BlockCategory {
    TEXT = 'text',
    MEDIA = 'media',
    STRUCTURE = 'structure',
}

/**
 * 块类型配置接口
 */
export interface BlockTypeConfig {
    /** 块类型标识符 */
    type: string;
    /** 块类型名称 */
    name: string;
    /** 块类别 */
    category: BlockCategory;
    /** 图标标识 */
    icon: string;
    /** 描述信息 */
    description: string;
    /** 默认内容生成函数 */
    defaultContent: () => Record<string, any>;
    /** 内容验证函数 */
    isValid: (content: Record<string, any>) => boolean;
    /** 允许的子块类型列表 */
    allowedChildren?: string[];
}

/**
 * BlockRegistry 类
 * 管理所有可用的块类型
 */
export class BlockRegistry {
    /** 注册的块类型映射表 */
    private registry: Map<string, BlockTypeConfig>;

    constructor() {
        this.registry = new Map();
    }

    /**
     * 注册块类型
     * @param config 块类型配置
     */
    register(config: BlockTypeConfig): void {
        this.registry.set(config.type, config);
    }

    /**
     * 获取块类型配置
     * @param type 块类型标识符
     * @returns 块类型配置，如果未注册则返回 undefined
     */
    get(type: string): BlockTypeConfig | undefined {
        return this.registry.get(type);
    }

    /**
     * 创建块实例
     * @param type 块类型标识符
     * @param content 块内容，如果未提供则使用默认内容
     * @returns 创建的块实例，如果类型未注册则返回 null
     */
    createBlock(type: string, content?: Record<string, any>): BaseBlock | null {
        const config = this.get(type);
        if (!config) {
            return null;
        }

        const blockContent = content ?? config.defaultContent();

        // 验证内容有效性
        if (!config.isValid(blockContent)) {
            return null;
        }

        // 生成唯一 ID
        const id = `block-${this.generateId()}`;

        return {
            id,
            type: type as BlockType,
            content: blockContent,
            children: undefined,
            styles: {},
            metadata: {},
        };
    }

    /**
     * 验证块内容
     * @param type 块类型标识符
     * @param content 待验证的内容
     * @returns 内容是否有效
     */
    validateBlock(type: string, content: Record<string, any>): boolean {
        const config = this.get(type);
        if (!config) {
            return false;
        }
        return config.isValid(content);
    }

    /**
     * 获取所有注册的块类型
     * @returns 块类型标识符数组
     */
    getAllTypes(): string[] {
        return Array.from(this.registry.keys());
    }

    /**
     * 按类别获取块类型
     * @param category 块类别
     * @returns 指定类别的块类型标识符数组
     */
    getByCategory(category: BlockCategory): string[] {
        const types: string[] = [];
        for (const [type, config] of this.registry.entries()) {
            if (config.category === category) {
                types.push(type);
            }
        }
        return types;
    }

    /**
     * 生成唯一 ID 后缀
     */
    private generateId(): string {
        return Math.random().toString(36).substring(2, 11);
    }
}

/**
 * 导出单例实例
 */
export const blockRegistry = new BlockRegistry();
