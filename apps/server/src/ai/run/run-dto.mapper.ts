import type { RunDto } from '../types/run.types';

/**
 * 从 LangChain messages 数组中提取最后一条 human message 的 content。
 *
 * 用于 streamRun 新 run 路径：SDK 把用户输入放在 input.messages 里，
 * 取最后一条 human message 作为本轮用户消息。
 *
 * @returns 最后一条 human message 的 content，无 human message 时返回 null。
 */
export function extractLastUserMessage(
    messages: Array<{ type: string; content: string }>,
): string | null {
    for (let i = messages.length - 1; i >= 0; i--) {
        const msg = messages[i];
        if (msg.type === 'human') {
            return msg.content;
        }
    }
    return null;
}

/**
 * Prisma Run 行的输入类型（结构化，兼容 findUnique/findMany 返回）。
 */
export interface PrismaRunLike {
    id: string;
    threadId: string;
    status: string;
    model: string | null;
    provider: string | null;
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    startedAt: Date | null;
    completedAt: Date | null;
    createdAt: Date;
}

/**
 * 将 Prisma Run 模型转换为 RunDto（API 响应格式）。
 */
export function toRunDto(run: PrismaRunLike): RunDto {
    return {
        id: run.id,
        threadId: run.threadId,
        status: run.status as RunDto['status'],
        model: run.model ?? undefined,
        provider: run.provider ?? undefined,
        promptTokens: run.promptTokens,
        completionTokens: run.completionTokens,
        totalTokens: run.totalTokens,
        startedAt: run.startedAt?.toISOString(),
        completedAt: run.completedAt?.toISOString(),
        createdAt: run.createdAt.toISOString(),
    };
}
