/**
 * search — 统一搜索接口
 */

export const searchTool = {
    name: 'search',
    description:
        '搜索文档内容。支持四种搜索模式：' +
        'text=在单个文档内搜索文本, ' +
        'grep=跨文件文本搜索（支持正则）, ' +
        'metadata=按标题/标签/日期等元数据搜索, ' +
        'semantic=语义相似度搜索。',
    inputSchema: {
        type: 'object',
        properties: {
            type: {
                type: 'string',
                enum: ['text', 'grep', 'metadata', 'semantic'],
                description: '搜索类型',
            },
            query: {
                type: 'string',
                description: '搜索关键词或表达式',
            },
            path: {
                type: 'string',
                description: 'text 模式：限定在某个文档内搜索',
            },
            documentId: {
                type: 'string',
                description: 'text 模式：限定在某个已打开文档内搜索',
            },
            scope: {
                type: 'array',
                items: { type: 'string' },
                description: 'grep 模式：限定搜索路径范围（支持 glob 模式）',
            },
            caseSensitive: {
                type: 'boolean',
                description: 'grep 模式：大小写敏感，默认 false',
                default: false,
            },
            regex: {
                type: 'boolean',
                description: 'grep 模式：启用正则匹配，默认 false',
                default: false,
            },
            filters: {
                type: 'object',
                description: 'metadata 模式：结构化搜索过滤条件',
                properties: {
                    title: { type: 'string', description: '标题匹配' },
                    tags: {
                        type: 'array',
                        items: { type: 'string' },
                        description: '包含的标签',
                    },
                    dateFrom: { type: 'string', description: '开始日期 (ISO 8601)' },
                    dateTo: { type: 'string', description: '结束日期 (ISO 8601)' },
                    hasBlocks: {
                        type: 'array',
                        items: { type: 'string' },
                        description: '包含的 block 类型',
                    },
                },
            },
            topK: {
                type: 'number',
                description: 'semantic 模式：返回结果数量，默认 5',
                default: 5,
            },
            maxResults: {
                type: 'number',
                description: '最大结果数，默认 20',
                default: 20,
            },
            includeContent: {
                type: 'boolean',
                description: '是否返回匹配内容片段，默认 true',
                default: true,
            },
        },
        required: ['type', 'query'],
    } as const,
};
