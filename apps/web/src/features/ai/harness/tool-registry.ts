/**
 * ToolRegistry — AI 工具注册/执行子模块
 *
 * 负责注册、查找和执行前端工具。纯注册中心，无外部依赖。
 */

import { Emitter, type Event } from '@/base/common/event';
import { Disposable } from '@/base/common/lifecycle';
import type { ToolHandler } from '../types/ai.types';

/**
 * ToolRegistry 接口
 */
export interface ToolRegistry {
    register(name: string, handler: ToolHandler): void;
    unregister(name: string): void;
    has(name: string): boolean;
    getSchemaDefinitions(): Array<{ name: string; description: string; inputSchema: object }>;
    execute(name: string, args: object): Promise<unknown>;
    dispose(): void;
}

class ToolRegistryImpl extends Disposable implements ToolRegistry {
    private _tools = new Map<string, ToolHandler>();
    private _onToolExecuted = new Emitter<{ name: string; result: unknown }>();

    register(name: string, handler: ToolHandler): void {
        this._tools.set(name, handler);
    }

    unregister(name: string): void {
        this._tools.delete(name);
    }

    has(name: string): boolean {
        return this._tools.has(name);
    }

    /**
     * 获取所有工具的 schema 定义（发送给后端，后端再发给 LLM）
     */
    getSchemaDefinitions(): Array<{ name: string; description: string; inputSchema: object }> {
        const schemas: Array<{ name: string; description: string; inputSchema: object }> = [];
        for (const [_name, handler] of this._tools) {
            schemas.push({
                name: handler.name,
                description: handler.description,
                inputSchema: handler.inputSchema,
            });
        }
        return schemas;
    }

    /**
     * 执行指定工具
     */
    async execute(name: string, args: object): Promise<unknown> {
        const handler = this._tools.get(name);
        if (!handler) {
            throw new Error(`Tool "${name}" not registered`);
        }

        try {
            const result = await handler.execute(args as any);
            this._onToolExecuted.fire({ name, result });
            return result;
        } catch (error) {
            return { success: false, error: (error as Error).message };
        }
    }

    /**
     * 工具执行完成事件
     */
    get onToolExecuted(): Event<{ name: string; result: unknown }> {
        return this._onToolExecuted.event;
    }

    override dispose(): void {
        this._tools.clear();
        this._onToolExecuted.dispose();
        super.dispose();
    }
}

export function createToolRegistry(): ToolRegistry {
    return new ToolRegistryImpl();
}
