/**
 * file_ops — 文件/文件夹操作
 */

export const fileOpsTool = {
    name: 'file_ops',
    description:
        '对文件和文件夹进行操作：列出目录(list)、创建(create)、删除(delete)、移动(move)、重命名(rename)、复制(copy)。' +
        '路径可以使用 file:// 前缀，也可以使用相对于当前项目根目录的路径；不要使用 memory://。',
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
                description: '目标路径（如 file://folder/file.km 或 folder/file.km）',
            },
            destination: {
                type: 'string',
                description:
                    'move/copy 操作的目标路径（如 file://folder/file.km 或 folder/file.km）',
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
