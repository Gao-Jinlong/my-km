/**
 * doc_edit — 文档内容编辑
 */

export const docEditTool = {
    name: 'doc_edit',
    description:
        '编辑文档内容。支持三个级别的操作：' +
        'text 级别(splice-text, insert-text)、' +
        'block 级别(insert-block, replace-block, delete-block, move-block)、' +
        'inline 级别(format-inline, insert-inline)。' +
        '可通过 documentId（已打开文档）或 path（未打开文档）指定目标。',
    inputSchema: {
        type: 'object',
        properties: {
            path: {
                type: 'string',
                description: '未打开文档的文件路径',
            },
            documentId: {
                type: 'string',
                description: '已打开文档的 ID',
            },
            operationType: {
                type: 'string',
                enum: [
                    'splice-text',
                    'insert-text',
                    'insert-block',
                    'replace-block',
                    'delete-block',
                    'move-block',
                    'format-inline',
                    'insert-inline',
                ],
                description: '编辑操作类型',
            },
            position: {
                type: 'number',
                description: 'splice-text: 字符偏移量（从 0 开始）',
            },
            deleteCount: {
                type: 'number',
                description: 'splice-text: 要删除的字符数',
            },
            text: {
                type: 'string',
                description: 'insert-text / splice-text: 要插入的文本内容',
            },
            blockId: {
                type: 'string',
                description: '目标 block 的 ID',
            },
            blockType: {
                type: 'string',
                enum: ['paragraph', 'heading', 'list', 'quote', 'code', 'table', 'image', 'formula'],
                description: 'insert-block 时的 block 类型',
            },
            content: {
                description: 'block 内容（JSON 对象或文本字符串）',
            },
            afterBlockId: {
                type: 'string',
                description: 'insert-block: 在此 block 之后插入',
            },
            beforeBlockId: {
                type: 'string',
                description: 'insert-block: 在此 block 之前插入',
            },
            targetIndex: {
                type: 'number',
                description: 'move-block: 移动到指定索引位置',
            },
            rangeStart: {
                type: 'number',
                description: 'inline 操作的起始字符偏移（在 block 内）',
            },
            rangeEnd: {
                type: 'number',
                description: 'inline 操作的结束字符偏移（在 block 内）',
            },
            format: {
                type: 'string',
                enum: ['bold', 'italic', 'underline', 'strikethrough', 'code', 'link', 'formula'],
                description: 'inline 格式类型',
            },
            url: {
                type: 'string',
                description: 'format=link 时的 URL',
            },
            formula: {
                type: 'string',
                description: 'format=formula 时的 LaTeX 公式内容',
            },
        },
        required: ['operationType'],
    } as const,
};
