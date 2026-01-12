/**
 * 链路追踪工具
 * 提供统一的 Trace ID 生成和解析功能
 * 根据 docs/technical/logging-standard.md 规范实现
 */

/**
 * 生成 Trace ID
 * 格式: {timestamp}-{random}
 * 示例: 1705024645123-abc123xyz
 */
export function generateTraceId(): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 11);
    return `${timestamp}-${random}`;
}

/**
 * 验证 Trace ID 格式
 */
export function isValidTraceId(traceId: string): boolean {
    if (!traceId || typeof traceId !== 'string') {
        return false;
    }

    const parts = traceId.split('-');
    if (parts.length !== 2) {
        return false;
    }

    const [timestamp, random] = parts;

    // 验证时间戳部分
    const timestampNum = Number.parseInt(timestamp, 10);
    if (Number.isNaN(timestampNum) || timestampNum.toString().length !== timestamp.length) {
        return false;
    }

    // 验证随机部分（应该是字母数字）
    if (!/^[a-z0-9]+$/i.test(random)) {
        return false;
    }

    return true;
}

/**
 * 从 Trace ID 中提取时间戳
 */
export function extractTimestamp(traceId: string): Date | null {
    if (!isValidTraceId(traceId)) {
        return null;
    }

    const timestamp = Number.parseInt(traceId.split('-')[0], 10);
    return new Date(timestamp);
}

/**
 * 创建带有 Trace ID 的请求头对象
 */
export function createTraceHeaders(traceId?: string): Record<string, string> {
    const id = traceId || generateTraceId();
    return {
        'X-Trace-Id': id,
    };
}
