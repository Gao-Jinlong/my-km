/**
 * ToolRegistry — 工具 schema 注册
 *
 * 管理发送给 LLM 的工具定义。
 * 工具执行在前端，服务端只负责 schema 管理和结果分发。
 */

import { Injectable } from '@nestjs/common';
import type { ToolDefinition } from '../ai.types';
import type { RegisteredTool } from './tool.types';

@Injectable()
export class ToolRegistry {
    private tools = new Map<string, RegisteredTool>();

    /**
     * 注册工具 schema
     */
    register(name: string, definition: ToolDefinition): void {
        this.tools.set(name, { name, definition });
    }

    /**
     * 批量注册
     */
    registerMany(tools: ToolDefinition[]): void {
        for (const tool of tools) {
            this.register(tool.name, tool);
        }
    }

    /**
     * 获取所有工具定义（发送给 LLM）
     */
    getDefinitions(): ToolDefinition[] {
        return Array.from(this.tools.values()).map(t => t.definition);
    }

    /**
     * 获取单个工具定义
     */
    getDefinition(name: string): ToolDefinition | undefined {
        return this.tools.get(name)?.definition;
    }

    /**
     * 检查工具是否已注册
     */
    has(name: string): boolean {
        return this.tools.has(name);
    }

    /**
     * 清除所有工具
     */
    clear(): void {
        this.tools.clear();
    }
}
