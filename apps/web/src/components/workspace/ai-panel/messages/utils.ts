/**
 * 消息组件共享工具函数
 */

/**
 * 把工具调用参数格式化成简短摘要，用于状态指示器展示
 * 例如 file_ops {operation:'create', path:'ginlon.km'} → "create · ginlon.km"
 */
export function summarizeArgs(args?: Record<string, unknown>): string {
    if (!args || typeof args !== 'object') return '';

    // 常见字段优先：path / operation / destination
    const parts: string[] = [];
    const operation = typeof args.operation === 'string' ? args.operation : null;
    const path = typeof args.path === 'string' ? args.path : null;
    const destination = typeof args.destination === 'string' ? args.destination : null;

    if (operation) parts.push(operation);
    if (path) parts.push(path);
    else if (destination) parts.push(destination);

    if (parts.length > 0) return parts.join(' · ');

    // 回退：键值对简述
    return Object.entries(args)
        .slice(0, 2)
        .map(([k, v]) => `${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`)
        .join(', ');
}
