/**
 * doc_read — 文档内容读取
 */

export const docReadTool = {
    name: 'doc_read',
    description:
        '读取文档内容。支持三种格式：纯文本(text)、结构化 block 数据(blocks)、原始 .km JSON(raw)。' +
        '可通过行范围或 block ID/索引指定读取范围。',
    inputSchema: {
        type: 'object',
        properties: {
            path: {
                type: 'string',
                description: '未打开文档的文件路径（包含 scheme 前缀）',
            },
            documentId: {
                type: 'string',
                description: '已打开文档的 ID（与 path 二选一）',
            },
            format: {
                type: 'string',
                enum: ['text', 'blocks', 'raw'],
                description: '输出格式：text=纯文本, blocks=JSON 结构化 block 数据, raw=原始 .km JSON。默认 text',
                default: 'text',
            },
            rangeType: {
                type: 'string',
                enum: ['full', 'blocks', 'text-range'],
                description: '读取范围类型：full=整个文档, blocks=按 block 索引范围, text-range=按行范围。默认 full',
                default: 'full',
            },
            startLine: {
                type: 'number',
                description: 'text-range 模式：起始行号，从 1 开始',
            },
            endLine: {
                type: 'number',
                description: 'text-range 模式：结束行号，含此行',
            },
            blockStart: {
                type: 'number',
                description: 'blocks 模式：起始 block 索引，从 0 开始',
            },
            blockEnd: {
                type: 'number',
                description: 'blocks 模式：结束 block 索引（不含）',
            },
            blockIds: {
                type: 'array',
                items: { type: 'string' },
                description: 'blocks 模式：按 block ID 列表读取',
            },
        },
    } as const,
};
