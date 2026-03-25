/**
 * EditorContainer - 全局多编辑器管理器
 *
 * 负责管理多个编辑器实例，提供创建、获取、销毁编辑器服务的功能
 * 采用单例模式
 */

import type { BlockRegistry as BlockRegistryType } from '../registry/BlockRegistry';
import type { EditorService } from '../service/EditorService';
import { createEditorService } from '../service/EditorService';
import type { EditorStoreApi } from '../store/editor-store';

/**
 * EditorContainer 类
 * 管理所有编辑器实例的全局容器
 */
export class EditorContainer {
    /** 块注册中心 */
    private blockRegistry: BlockRegistryType;

    /** 编辑器服务映射表 */
    private editorServices: Map<string, EditorService>;

    /** Store 映射表 */
    private stores: Map<string, EditorStoreApi>;

    /** 单例实例 */
    private static instance: EditorContainer | null = null;

    /**
     * 私有构造函数，防止直接实例化
     * @param blockRegistry 块注册中心
     */
    private constructor(blockRegistry: BlockRegistryType) {
        this.blockRegistry = blockRegistry;
        this.editorServices = new Map();
        this.stores = new Map();
    }

    /**
     * 获取单例实例
     * @param blockRegistry 块注册中心，首次创建时必须提供
     * @returns EditorContainer 单例实例
     */
    static getInstance(blockRegistry: BlockRegistryType): EditorContainer {
        if (!EditorContainer.instance) {
            EditorContainer.instance = new EditorContainer(blockRegistry);
        }
        return EditorContainer.instance;
    }

    /**
     * 创建编辑器实例
     * @param documentId 文档 ID
     * @returns 创建的编辑器服务实例
     */
    createInstance(documentId: string): EditorService {
        // 检查是否已存在该文档的编辑器实例
        const existingService = this.editorServices.get(documentId);
        if (existingService) {
            console.warn(`Editor instance for document ${documentId} already exists`);
            return existingService;
        }

        // 创建新的编辑器服务
        const service = createEditorService(documentId, this.blockRegistry);

        // 存储实例和 store
        this.editorServices.set(documentId, service);
        this.stores.set(documentId, service.store);

        return service;
    }

    /**
     * 获取编辑器服务
     * @param documentId 文档 ID
     * @returns 编辑器服务实例，如果不存在则返回 null
     */
    getService(documentId: string): EditorService | null {
        return this.editorServices.get(documentId) ?? null;
    }

    /**
     * 获取 Store
     * @param documentId 文档 ID
     * @returns Store 实例，如果不存在则返回 null
     */
    getStore(documentId: string): EditorStoreApi | null {
        return this.stores.get(documentId) ?? null;
    }

    /**
     * 销毁实例
     * @param documentId 文档 ID
     */
    disposeInstance(documentId: string): void {
        const service = this.editorServices.get(documentId);
        if (service) {
            // 调用服务的销毁方法
            service.destroy();

            // 从映射表中移除
            this.editorServices.delete(documentId);
            this.stores.delete(documentId);
        }
    }

    /**
     * 销毁所有实例
     */
    disposeAll(): void {
        // 销毁所有编辑器服务
        for (const service of this.editorServices.values()) {
            service.destroy();
        }

        // 清空映射表
        this.editorServices.clear();
        this.stores.clear();
    }

    /**
     * 获取所有编辑器实例的文档 ID 列表
     * @returns 文档 ID 数组
     */
    getAllDocumentIds(): string[] {
        return Array.from(this.editorServices.keys());
    }

    /**
     * 获取编辑器实例数量
     * @returns 实例数量
     */
    getInstanceCount(): number {
        return this.editorServices.size;
    }

    /**
     * 重置单例实例（用于测试）
     */
    static resetInstance(): void {
        if (EditorContainer.instance) {
            EditorContainer.instance.disposeAll();
            EditorContainer.instance = null;
        }
    }
}
