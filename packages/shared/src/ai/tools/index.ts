/**
 * 工具 Schema 定义 — 前后端共享单一数据源
 *
 * 这些 schema 发送给 LLM，用于 tool call 协议。
 * 前端同时包含执行逻辑，后端仅使用 schema 定义。
 */

/**
 * 获取文档内容
 */
export const getDocumentContentTool = {
    name: 'get_document_content',
    description: '获取指定文档的完整内容或选中文本',
    inputSchema: {
        type: 'object',
        properties: {
            documentId: { type: 'string', description: '文档 ID' },
            selectionOnly: { type: 'boolean', description: '是否只返回选中文本' },
        },
        required: ['documentId'],
    } as const,
};

/**
 * 获取目录树
 */
export const getFileTreeTool = {
    name: 'get_file_tree',
    description: '获取当前项目的目录树结构',
    inputSchema: {
        type: 'object',
        properties: {
            maxDepth: { type: 'number', description: '最大目录深度', default: 3 },
        },
    } as const,
};

/**
 * 插入文本到光标位置
 */
export const insertTextTool = {
    name: 'insert_text',
    description: '在当前文档光标位置插入文本',
    inputSchema: {
        type: 'object',
        properties: {
            text: { type: 'string', description: '要插入的文本' },
        },
        required: ['text'],
    } as const,
};

/**
 * 替换选中文本
 */
export const replaceTextTool = {
    name: 'replace_text',
    description: '替换当前文档中的选中文本',
    inputSchema: {
        type: 'object',
        properties: {
            newText: { type: 'string', description: '替换后的文本' },
        },
        required: ['newText'],
    } as const,
};
