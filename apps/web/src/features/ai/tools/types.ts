/**
 * 前端 LLM 工具执行相关类型
 *
 * 注意：与 apps/web/src/features/ai/types/ai.types.ts 中的 ToolHandler 不同。
 * 那个接口面向通用的前端工具注册（含 description、inputSchema），
 * 本类型专为 LLM 工具的 interrupt/resume 执行流程设计。
 */

/**
 * 工具执行结果（返回给 LLM 的 ToolMessage 内容）
 */
export interface ToolResult {
    success: boolean;
    error?: string;
    [key: string]: unknown;
}

/**
 * 前端工具处理器接口
 */
export interface FrontendToolHandler {
    /** 工具名称，与 shared schema 中的 name 一致 */
    readonly name: string;
    /**
     * 操作类型：
     * - read 自动执行，无需用户确认
     * - write 需要用户确认后执行
     */
    readonly type: 'read' | 'write';
    /** 执行工具逻辑 */
    execute(args: Record<string, unknown>): Promise<ToolResult>;
    /** 人类可读的操作描述（用于确认 UI 展示） */
    describe(args: Record<string, unknown>): string;
}

/**
 * 工具确认请求（写操作发起时触发，UI 监听并展示对话框）
 */
export interface ConfirmationRequest {
    toolName: string;
    input: Record<string, unknown>;
    description: string;
    /** 用户决定回调（true=确认，false=拒绝） */
    resolve: (approved: boolean) => void;
}
