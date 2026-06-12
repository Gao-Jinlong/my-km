/**
 * 工具 Schema 定义 — 前后端共享单一数据源
 *
 * 这些 schema 发送给 LLM，用于 tool call 协议。
 * 前端同时包含执行逻辑（FrontendToolExecutor），后端仅使用 schema 定义。
 */

/**
 * 获取文档内容（支持按行号切片）
 */
export const getDocumentContentTool = {
    name: 'get_document_content',
    description: '获取指定文档的完整内容或指定行范围的内容',
    inputSchema: {
        type: 'object',
        properties: {
            documentId: { type: 'string', description: '文档 ID' },
            startLine: {
                type: 'number',
                description: '起始行号，从 1 开始（可选）',
            },
            endLine: {
                type: 'number',
                description: '结束行号，含此行（可选）',
            },
        },
        required: ['documentId'],
    } as const,
};

/**
 * 获取目录的子项（文件/目录）
 */
export const getChildItemsTool = {
    name: 'get_child_items',
    description: '获取指定目录下递归 depth 层的子文件和子目录',
    inputSchema: {
        type: 'object',
        properties: {
            root: {
                type: 'string',
                description: '根路径，默认为项目根目录（可选）',
            },
            depth: {
                type: 'number',
                description: '递归深度，默认 1',
                default: 1,
            },
        },
    } as const,
};

/**
 * 在文档指定位置插入文本
 */
export const insertTextTool = {
    name: 'insert_text',
    description: '在指定文档的末尾或光标位置插入文本',
    inputSchema: {
        type: 'object',
        properties: {
            text: { type: 'string', description: '要插入的文本' },
            documentId: { type: 'string', description: '文档 ID' },
            position: {
                type: 'string',
                enum: ['end', 'cursor'],
                description: '插入位置，默认 end',
                default: 'end',
            },
        },
        required: ['text', 'documentId'],
    } as const,
};

/**
 * 对文档执行 splice 操作（类似 JavaScript Array.splice）
 * 从 start 位置删除 deleteCount 个字符，然后插入 insert 文本
 */
export const spliceTextTool = {
    name: 'splice_text',
    description:
        '对文档执行 splice 操作：从 start 位置删除 deleteCount 个字符，然后插入 insert 文本',
    inputSchema: {
        type: 'object',
        properties: {
            documentId: { type: 'string', description: '文档 ID' },
            start: {
                type: 'number',
                description: '起始字符位置，从 0 开始',
            },
            deleteCount: {
                type: 'number',
                description: '要删除的字符数',
            },
            insert: {
                type: 'string',
                description: '要插入的文本（可选，不传则只删除）',
            },
        },
        required: ['documentId', 'start', 'deleteCount'],
    } as const,
};
