/**
 * file_ops — 文件/文件夹操作
 */

export const fileOpsTool = {
    name: 'file_ops',
    description:
        '对文件和文件夹进行操作：列出目录(list)、创建(create)、删除(delete)、移动(move)、重命名(rename)、复制(copy)。' +
        '所有路径相对于项目根目录，使用 memory:// 前缀。',
    inputSchema: {
        type: 'object',
        properties: {
            operation: {
                type: 'string',
                enum: ['list', 'create', 'delete', 'move', 'rename', 'copy'],
                description: '要执行的操作类型',
            },
            path: {
                type: 'string',
                description: '目标路径（包含 scheme 前缀，如 memory://folder/file.km）',
            },
            destination: {
                type: 'string',
                description: 'move/copy 操作的目标路径',
            },
            type: {
                type: 'string',
                enum: ['file', 'folder'],
                description: 'create 操作时指定创建类型',
            },
            recursive: {
                type: 'boolean',
                description: 'list 操作时是否递归列出子目录，默认 false',
                default: false,
            },
            depth: {
                type: 'number',
                description: 'list 操作时的递归深度，默认 1。仅在 recursive=true 时生效',
                default: 1,
            },
        },
        required: ['operation', 'path'],
    } as const,
};
