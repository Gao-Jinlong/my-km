# LLM Toolcall 工具集 — 核心工具替换 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用 4 个新分层工具（file_ops, doc_read, doc_edit, search）替换现有 4 个工具，并加入确认策略系统。

**Architecture:** 保持现有 LangGraph interrupt/resume + FrontendToolExecutor 分发器架构不变。新工具按分层模式组织：每个工具通过 `operation`/`type` 参数支持多种操作。新增确认策略模块控制写操作审批。Handler 遵循现有 `FrontendToolHandler` 接口。

**Tech Stack:** TypeScript, LangChain Tools, Lexical Editor, Vitest (前端测试)

**Design Spec:** `docs/superpowers/specs/2026-06-12-llm-toolcall-toolset-design.md`

---

## File Structure

### 新建文件

| 文件 | 职责 |
|------|------|
| `packages/shared/src/ai/tools/file-ops.ts` | file_ops 工具 schema |
| `packages/shared/src/ai/tools/doc-read.ts` | doc_read 工具 schema |
| `packages/shared/src/ai/tools/doc-edit.ts` | doc_edit 工具 schema |
| `packages/shared/src/ai/tools/search.ts` | search 工具 schema |
| `apps/web/src/features/ai/tools/confirmation-strategy.ts` | 确认策略系统 |
| `apps/web/src/features/ai/tools/handlers/file-ops.ts` | file_ops handler |
| `apps/web/src/features/ai/tools/handlers/doc-read.ts` | doc_read handler |
| `apps/web/src/features/ai/tools/handlers/doc-edit.ts` | doc_edit handler |
| `apps/web/src/features/ai/tools/handlers/search.ts` | search handler |
| `apps/web/src/features/ai/tools/__tests__/confirmation-strategy.test.ts` | 策略测试 |
| `apps/web/src/features/ai/tools/__tests__/file-ops.test.ts` | file_ops 测试 |
| `apps/web/src/features/ai/tools/__tests__/doc-read.test.ts` | doc_read 测试 |
| `apps/web/src/features/ai/tools/__tests__/doc-edit.test.ts` | doc_edit 测试 |

### 修改文件

| 文件 | 变更 |
|------|------|
| `packages/shared/src/ai/tools/index.ts` | 替换为 4 个新工具的重导出 |
| `packages/shared/src/ai/index.ts` | 更新导出 |
| `apps/server/src/ai/tools/tool-definitions.ts` | 更新工具注册 |
| `apps/web/src/features/ai/tools/frontend-tool-executor.ts` | 集成策略系统 |
| `apps/web/src/features/ai/tools/types.ts` | 扩展 handler 类型 |
| `apps/web/src/components/workspace/ai-panel/ai-panel.tsx` | 注册新 handler + 策略 UI |

### 删除文件（最后一步）

| 文件 | 原因 |
|------|------|
| `apps/web/src/features/ai/tools/handlers/get-document-content.ts` | 被 doc-read 替代 |
| `apps/web/src/features/ai/tools/handlers/get-child-items.ts` | 被 file-ops 替代 |
| `apps/web/src/features/ai/tools/handlers/insert-text.ts` | 被 doc-edit 替代 |
| `apps/web/src/features/ai/tools/handlers/splice-text.ts` | 被 doc-edit 替代 |

---

## Task 1: 新建工具 Schema 定义

**Files:**
- Create: `packages/shared/src/ai/tools/file-ops.ts`
- Create: `packages/shared/src/ai/tools/doc-read.ts`
- Create: `packages/shared/src/ai/tools/doc-edit.ts`
- Create: `packages/shared/src/ai/tools/search.ts`
- Modify: `packages/shared/src/ai/tools/index.ts`
- Modify: `packages/shared/src/ai/index.ts`

- [ ] **Step 1: 创建 file-ops schema**

创建 `packages/shared/src/ai/tools/file-ops.ts`：

```typescript
/**
 * file_ops — 文件/文件夹操作
 *
 * 处理 .km 文件和目录的 CRUD 操作，不涉及文档内容编辑。
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
```

- [ ] **Step 2: 创建 doc-read schema**

创建 `packages/shared/src/ai/tools/doc-read.ts`：

```typescript
/**
 * doc_read — 文档内容读取
 *
 * 读取文档内容，支持纯文本、结构化 block、原始 .km JSON 三种输出格式。
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
```

- [ ] **Step 3: 创建 doc-edit schema**

创建 `packages/shared/src/ai/tools/doc-edit.ts`：

```typescript
/**
 * doc_edit — 文档内容编辑
 *
 * 统一的文档编辑入口，支持 text/block/inline 三个级别的操作。
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
            // text 操作参数
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
            // block 操作参数
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
            // inline 操作参数
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
```

- [ ] **Step 4: 创建 search schema**

创建 `packages/shared/src/ai/tools/search.ts`：

```typescript
/**
 * search — 统一搜索接口
 *
 * 通过 type 参数支持 4 种搜索模式：
 * text（文档内搜索）、grep（跨文件搜索）、metadata（结构化搜索）、semantic（语义搜索）。
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
```

- [ ] **Step 5: 更新 shared/tools/index.ts**

替换 `packages/shared/src/ai/tools/index.ts` 的全部内容：

```typescript
/**
 * 工具 Schema 定义 — 前后端共享单一数据源
 *
 * 这些 schema 发送给 LLM，用于 tool call 协议。
 * 前端同时包含执行逻辑（FrontendToolExecutor），后端仅使用 schema 定义。
 */

export { fileOpsTool } from './file-ops';
export { docReadTool } from './doc-read';
export { docEditTool } from './doc-edit';
export { searchTool } from './search';
```

- [ ] **Step 6: 更新 shared/ai/index.ts**

替换 `packages/shared/src/ai/index.ts` 的全部内容：

```typescript
export { fileOpsTool, docReadTool, docEditTool, searchTool } from './tools';
```

- [ ] **Step 7: 验证 shared 包编译**

Run: `cd packages/shared && pnpm build`
Expected: 编译成功，无错误

- [ ] **Step 8: Commit**

```bash
git add packages/shared/src/ai/
git commit -m "feat(ai): define new layered tool schemas (file_ops, doc_read, doc_edit, search)"
```

---

## Task 2: 更新 Backend 工具注册

**Files:**
- Modify: `apps/server/src/ai/tools/tool-definitions.ts`

- [ ] **Step 1: 更新 tool-definitions.ts**

替换 `apps/server/src/ai/tools/tool-definitions.ts` 的全部内容：

```typescript
/**
 * ToolDefinitions — 共享 schema 转 LangChain Tool 实例
 *
 * 这些"前端工具"在后端不真正执行：tool-node.ts 通过 LangGraph `interrupt()`
 * 暂停 graph，等待前端通过 SDK `command.resume` 提供结果。
 */

import { type StructuredToolInterface, tool } from '@langchain/core/tools';
import { docEditTool, docReadTool, fileOpsTool, searchTool } from '@my-km/shared';
import { z } from 'zod';

/**
 * 前端工具名称集合 — 这些工具需要前端执行，触发 interrupt
 */
export const FRONTEND_TOOLS = new Set([
    'file_ops',
    'doc_read',
    'doc_edit',
    'search',
]);

function _makeFrontendTool(def: {
    name: string;
    description: string;
    inputSchema: Record<string, unknown>;
}): StructuredToolInterface {
    return tool(
        async () => {
            throw new Error(
                `Frontend tool "${def.name}" should be executed by client via LangGraph interrupt/resume, not invoked server-side`,
            );
        },
        {
            name: def.name,
            description: def.description,
            schema: z.any(),
        },
    );
}

export const frontendTools: StructuredToolInterface[] = [
    _makeFrontendTool(fileOpsTool),
    _makeFrontendTool(docReadTool),
    _makeFrontendTool(docEditTool),
    _makeFrontendTool(searchTool),
];

export function isFrontendTool(toolName: string): boolean {
    return FRONTEND_TOOLS.has(toolName);
}
```

- [ ] **Step 2: 验证 server 编译**

Run: `cd apps/server && pnpm build`
Expected: 编译成功

- [ ] **Step 3: Commit**

```bash
git add apps/server/src/ai/tools/tool-definitions.ts
git commit -m "feat(ai): update backend tool registration for new layered tools"
```

---

## Task 3: 实现确认策略系统

**Files:**
- Create: `apps/web/src/features/ai/tools/confirmation-strategy.ts`
- Create: `apps/web/src/features/ai/tools/__tests__/confirmation-strategy.test.ts`

- [ ] **Step 1: 创建 confirmation-strategy.ts**

创建 `apps/web/src/features/ai/tools/confirmation-strategy.ts`：

```typescript
/**
 * 确认策略系统 — 控制 LLM 编辑操作的审批流程
 *
 * 4 种策略模式：
 * - bypass: 自动通过所有操作
 * - confirm-write: 写操作需确认（默认）
 * - confirm-all: 所有操作需确认
 * - confirm-destructive: 仅破坏性操作需确认
 */

export type ConfirmationMode = 'bypass' | 'confirm-write' | 'confirm-all' | 'confirm-destructive';

export interface ConfirmationStrategy {
    readonly mode: ConfirmationMode;
    /** 判断给定操作是否需要用户确认 */
    needsConfirmation(toolName: string, operation: Record<string, unknown>): boolean;
}

/**
 * 破坏性操作判定
 *
 * 以下操作被判定为"破坏性"：
 * - file_ops 的 delete 操作
 * - doc_edit 的 delete-block 操作
 * - doc_edit 的 splice-text（当 deleteCount > 0 时）
 * - file_ops 的 move（当目标路径已存在时 — 此处简化为始终需确认）
 */
function isDestructiveOperation(toolName: string, input: Record<string, unknown>): boolean {
    if (toolName === 'file_ops') {
        const op = input.operation as string;
        return op === 'delete' || op === 'move';
    }
    if (toolName === 'doc_edit') {
        const opType = input.operationType as string;
        if (opType === 'delete-block') return true;
        if (opType === 'splice-text') {
            const deleteCount = input.deleteCount as number;
            return typeof deleteCount === 'number' && deleteCount > 0;
        }
    }
    return false;
}

/**
 * 判断操作是否为写操作
 */
function isWriteOperation(toolName: string, input: Record<string, unknown>): boolean {
    if (toolName === 'doc_edit') return true;
    if (toolName === 'file_ops') {
        const op = input.operation as string;
        return op !== 'list';
    }
    return false;
}

export function createConfirmationStrategy(mode: ConfirmationMode): ConfirmationStrategy {
    return {
        mode,
        needsConfirmation(toolName: string, input: Record<string, unknown>): boolean {
            switch (mode) {
                case 'bypass':
                    return false;
                case 'confirm-write':
                    return isWriteOperation(toolName, input);
                case 'confirm-all':
                    return true;
                case 'confirm-destructive':
                    return isDestructiveOperation(toolName, input);
            }
        },
    };
}
```

- [ ] **Step 2: 写确认策略测试**

创建 `apps/web/src/features/ai/tools/__tests__/confirmation-strategy.test.ts`：

```typescript
import { describe, expect, it } from 'vitest';
import { createConfirmationStrategy, type ConfirmationMode } from '../confirmation-strategy';

describe('ConfirmationStrategy', () => {
    const modes: ConfirmationMode[] = ['bypass', 'confirm-write', 'confirm-all', 'confirm-destructive'];

    it('每个模式都能创建策略实例', () => {
        for (const mode of modes) {
            const strategy = createConfirmationStrategy(mode);
            expect(strategy.mode).toBe(mode);
        }
    });

    describe('bypass 模式', () => {
        const strategy = createConfirmationStrategy('bypass');

        it('所有操作都不需要确认', () => {
            expect(strategy.needsConfirmation('file_ops', { operation: 'delete' })).toBe(false);
            expect(strategy.needsConfirmation('doc_edit', { operationType: 'splice-text' })).toBe(false);
            expect(strategy.needsConfirmation('doc_read', {})).toBe(false);
        });
    });

    describe('confirm-write 模式', () => {
        const strategy = createConfirmationStrategy('confirm-write');

        it('读操作不需要确认', () => {
            expect(strategy.needsConfirmation('doc_read', {})).toBe(false);
            expect(strategy.needsConfirmation('file_ops', { operation: 'list' })).toBe(false);
            expect(strategy.needsConfirmation('search', {})).toBe(false);
        });

        it('写操作需要确认', () => {
            expect(strategy.needsConfirmation('file_ops', { operation: 'create' })).toBe(true);
            expect(strategy.needsConfirmation('file_ops', { operation: 'delete' })).toBe(true);
            expect(strategy.needsConfirmation('doc_edit', { operationType: 'splice-text' })).toBe(true);
            expect(strategy.needsConfirmation('doc_edit', { operationType: 'insert-text' })).toBe(true);
        });
    });

    describe('confirm-all 模式', () => {
        const strategy = createConfirmationStrategy('confirm-all');

        it('所有操作都需要确认', () => {
            expect(strategy.needsConfirmation('doc_read', {})).toBe(true);
            expect(strategy.needsConfirmation('file_ops', { operation: 'list' })).toBe(true);
            expect(strategy.needsConfirmation('doc_edit', { operationType: 'insert-text' })).toBe(true);
        });
    });

    describe('confirm-destructive 模式', () => {
        const strategy = createConfirmationStrategy('confirm-destructive');

        it('非破坏性写操作不需要确认', () => {
            expect(strategy.needsConfirmation('doc_read', {})).toBe(false);
            expect(strategy.needsConfirmation('file_ops', { operation: 'list' })).toBe(false);
            expect(strategy.needsConfirmation('file_ops', { operation: 'create' })).toBe(false);
            expect(strategy.needsConfirmation('doc_edit', { operationType: 'insert-text' })).toBe(false);
            expect(strategy.needsConfirmation('doc_edit', { operationType: 'insert-block' })).toBe(false);
        });

        it('破坏性操作需要确认', () => {
            expect(strategy.needsConfirmation('file_ops', { operation: 'delete' })).toBe(true);
            expect(strategy.needsConfirmation('file_ops', { operation: 'move' })).toBe(true);
            expect(strategy.needsConfirmation('doc_edit', { operationType: 'delete-block' })).toBe(true);
            expect(strategy.needsConfirmation('doc_edit', { operationType: 'splice-text', deleteCount: 5 })).toBe(true);
        });

        it('splice-text deleteCount=0 不算破坏性', () => {
            expect(strategy.needsConfirmation('doc_edit', { operationType: 'splice-text', deleteCount: 0 })).toBe(false);
        });
    });
});
```

- [ ] **Step 3: 运行测试**

Run: `cd apps/web && pnpm test -- --run src/features/ai/tools/__tests__/confirmation-strategy.test.ts`
Expected: 所有测试通过

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/features/ai/tools/confirmation-strategy.ts apps/web/src/features/ai/tools/__tests__/
git commit -m "feat(ai): add confirmation strategy system with 4 modes"
```

---

## Task 4: 实现 FileOpsHandler

**Files:**
- Create: `apps/web/src/features/ai/tools/handlers/file-ops.ts`
- Create: `apps/web/src/features/ai/tools/__tests__/file-ops.test.ts`

- [ ] **Step 1: 写 file-ops handler 测试**

创建 `apps/web/src/features/ai/tools/__tests__/file-ops.test.ts`：

```typescript
import { describe, expect, it, vi } from 'vitest';
import { FileOpsHandler } from '../handlers/file-ops';

function createMockFileSystemService() {
    return {
        listFiles: vi.fn(),
        readFile: vi.fn(),
        writeFile: vi.fn(),
        createDirectory: vi.fn(),
        deleteFile: vi.fn(),
        deleteDirectory: vi.fn(),
        renameFile: vi.fn(),
        renameDirectory: vi.fn(),
        stat: vi.fn(),
    };
}

describe('FileOpsHandler', () => {
    const mockFs = createMockFileSystemService() as any;
    const getProjectRoot = vi.fn().mockReturnValue('memory://test-project');
    const handler = new FileOpsHandler(mockFs, getProjectRoot);

    it('name 和 type 正确', () => {
        expect(handler.name).toBe('file_ops');
        expect(handler.type).toBe('read');
    });

    describe('list 操作', () => {
        it('列出根目录内容', async () => {
            mockFs.listFiles.mockResolvedValue([
                { name: 'doc1.km', type: 'file', path: 'memory://test-project/doc1.km' },
                { name: 'notes', type: 'directory', path: 'memory://test-project/notes' },
            ]);

            const result = await handler.execute({
                operation: 'list',
                path: 'memory://test-project',
            });

            expect(result.success).toBe(true);
            expect(result.items).toHaveLength(2);
            expect(result.items![0].name).toBe('doc1.km');
        });

        it('递归列出子目录', async () => {
            mockFs.listFiles
                .mockResolvedValueOnce([
                    { name: 'notes', type: 'directory', path: 'memory://test-project/notes' },
                ])
                .mockResolvedValueOnce([
                    { name: 'note1.km', type: 'file', path: 'memory://test-project/notes/note1.km' },
                ]);

            const result = await handler.execute({
                operation: 'list',
                path: 'memory://test-project',
                recursive: true,
                depth: 2,
            });

            expect(result.success).toBe(true);
            expect(result.items![0].children).toHaveLength(1);
        });
    });

    describe('create 操作', () => {
        it('创建文件', async () => {
            mockFs.writeFile.mockResolvedValue(undefined);

            const result = await handler.execute({
                operation: 'create',
                path: 'memory://test-project/new.km',
                type: 'file',
            });

            expect(result.success).toBe(true);
        });

        it('创建文件夹', async () => {
            mockFs.createDirectory.mockResolvedValue(undefined);

            const result = await handler.execute({
                operation: 'create',
                path: 'memory://test-project/new-folder',
                type: 'folder',
            });

            expect(result.success).toBe(true);
        });
    });

    describe('delete 操作', () => {
        it('删除文件', async () => {
            mockFs.stat.mockResolvedValue({ type: 'file' });
            mockFs.deleteFile.mockResolvedValue(undefined);

            const result = await handler.execute({
                operation: 'delete',
                path: 'memory://test-project/doc.km',
            });

            expect(result.success).toBe(true);
        });

        it('删除文件夹', async () => {
            mockFs.stat.mockResolvedValue({ type: 'directory' });
            mockFs.deleteDirectory.mockResolvedValue(undefined);

            const result = await handler.execute({
                operation: 'delete',
                path: 'memory://test-project/notes',
            });

            expect(result.success).toBe(true);
        });
    });

    describe('rename 操作', () => {
        it('重命名文件', async () => {
            mockFs.stat.mockResolvedValue({ type: 'file' });
            mockFs.renameFile.mockResolvedValue(undefined);

            const result = await handler.execute({
                operation: 'rename',
                path: 'memory://test-project/old.km',
                destination: 'new.km',
            });

            expect(result.success).toBe(true);
        });
    });

    describe('describe()', () => {
        it('返回可读描述', () => {
            const desc = handler.describe({ operation: 'list', path: 'memory://test' });
            expect(desc).toContain('列出');
            expect(desc).toContain('memory://test');
        });
    });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd apps/web && pnpm test -- --run src/features/ai/tools/__tests__/file-ops.test.ts`
Expected: FAIL — `FileOpsHandler` 不存在

- [ ] **Step 3: 实现 FileOpsHandler**

创建 `apps/web/src/features/ai/tools/handlers/file-ops.ts`：

```typescript
import type { FileSystemService } from '@/platform/file-system/service';
import type { FrontendToolHandler, ToolResult } from '../types';

interface TreeItem {
    name: string;
    type: 'file' | 'directory';
    path: string;
    children?: TreeItem[];
}

/**
 * FileOpsHandler — file_ops 工具的处理器
 *
 * 支持：list, create, delete, move, rename, copy 操作。
 * 对于 list 以外的操作，需配合确认策略使用。
 */
export class FileOpsHandler implements FrontendToolHandler {
    readonly name = 'file_ops';
    readonly type = 'read'; // list 不需确认，其他操作由策略控制

    constructor(
        private readonly fileSystemService: FileSystemService,
        private readonly getProjectRoot: () => string | null,
    ) {}

    describe(args: Record<string, unknown>): string {
        const operation = String(args.operation ?? '');
        const path = String(args.path ?? '<project root>');
        const opLabels: Record<string, string> = {
            list: '列出',
            create: '创建',
            delete: '删除',
            move: '移动',
            rename: '重命名',
            copy: '复制',
        };
        return `${opLabels[operation] ?? operation} ${path}`;
    }

    async execute(args: Record<string, unknown>): Promise<ToolResult> {
        const operation = args.operation as string;
        const path = (args.path as string) || this.getProjectRoot();

        if (!path) {
            return { success: false, error: 'No path provided and no project root available' };
        }

        switch (operation) {
            case 'list':
                return this.handleList(path, args);
            case 'create':
                return this.handleCreate(path, args);
            case 'delete':
                return this.handleDelete(path);
            case 'move':
                return this.handleMove(path, args);
            case 'rename':
                return this.handleRename(path, args);
            case 'copy':
                return this.handleCopy(path, args);
            default:
                return { success: false, error: `Unknown operation: ${operation}` };
        }
    }

    private async handleList(path: string, args: Record<string, unknown>): Promise<ToolResult> {
        const recursive = args.recursive === true;
        const depth = typeof args.depth === 'number' && args.depth > 0 ? args.depth : 1;

        try {
            const items = recursive ? await this.walk(path, depth) : await this.listSingleLevel(path);
            return { success: true, path, items };
        } catch (err) {
            return {
                success: false,
                error: `Failed to list: ${(err as Error).message}`,
            };
        }
    }

    private async listSingleLevel(path: string): Promise<TreeItem[]> {
        const stats = await this.fileSystemService.listFiles(path);
        return stats.map(s => ({
            name: s.name,
            type: s.type as 'file' | 'directory',
            path: s.path,
        }));
    }

    private async walk(dir: string, remainingDepth: number): Promise<TreeItem[]> {
        const stats = await this.fileSystemService.listFiles(dir);
        const items: TreeItem[] = [];
        for (const stat of stats) {
            const item: TreeItem = {
                name: stat.name,
                type: stat.type as 'file' | 'directory',
                path: stat.path,
            };
            if (stat.type === 'directory' && remainingDepth > 1) {
                item.children = await this.walk(stat.path, remainingDepth - 1);
            }
            items.push(item);
        }
        return items;
    }

    private async handleCreate(path: string, args: Record<string, unknown>): Promise<ToolResult> {
        const type = args.type as string;
        try {
            if (type === 'folder') {
                await this.fileSystemService.createDirectory(path);
            } else {
                // 创建空 .km 文件
                const emptyKm = JSON.stringify({
                    version: 1,
                    metadata: { title: '', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
                    blocks: [],
                });
                await this.fileSystemService.writeFile(path, emptyKm);
            }
            return { success: true, path };
        } catch (err) {
            return { success: false, error: `Failed to create: ${(err as Error).message}` };
        }
    }

    private async handleDelete(path: string): Promise<ToolResult> {
        try {
            const stat = await this.fileSystemService.stat(path);
            if (stat.type === 'directory') {
                await this.fileSystemService.deleteDirectory(path);
            } else {
                await this.fileSystemService.deleteFile(path);
            }
            return { success: true };
        } catch (err) {
            return { success: false, error: `Failed to delete: ${(err as Error).message}` };
        }
    }

    private async handleMove(path: string, args: Record<string, unknown>): Promise<ToolResult> {
        const destination = args.destination as string;
        if (!destination) {
            return { success: false, error: 'destination is required for move operation' };
        }
        try {
            // 读取源文件 → 写入目标 → 删除源
            const content = await this.fileSystemService.readFile(path);
            const contentStr = typeof content === 'string' ? content : new TextDecoder().decode(content);
            await this.fileSystemService.writeFile(destination, contentStr);
            await this.fileSystemService.deleteFile(path);
            return { success: true, newPath: destination };
        } catch (err) {
            return { success: false, error: `Failed to move: ${(err as Error).message}` };
        }
    }

    private async handleRename(path: string, args: Record<string, unknown>): Promise<ToolResult> {
        const destination = args.destination as string;
        if (!destination) {
            return { success: false, error: 'destination is required for rename operation' };
        }
        try {
            const stat = await this.fileSystemService.stat(path);
            // destination 只传新名称（不含路径），需要提取
            const newName = destination;
            if (stat.type === 'directory') {
                await this.fileSystemService.renameDirectory(path, newName);
            } else {
                await this.fileSystemService.renameFile(path, newName);
            }
            return { success: true, newPath: destination };
        } catch (err) {
            return { success: false, error: `Failed to rename: ${(err as Error).message}` };
        }
    }

    private async handleCopy(path: string, args: Record<string, unknown>): Promise<ToolResult> {
        const destination = args.destination as string;
        if (!destination) {
            return { success: false, error: 'destination is required for copy operation' };
        }
        try {
            const content = await this.fileSystemService.readFile(path);
            const contentStr = typeof content === 'string' ? content : new TextDecoder().decode(content);
            await this.fileSystemService.writeFile(destination, contentStr);
            return { success: true, newPath: destination };
        } catch (err) {
            return { success: false, error: `Failed to copy: ${(err as Error).message}` };
        }
    }
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `cd apps/web && pnpm test -- --run src/features/ai/tools/__tests__/file-ops.test.ts`
Expected: 所有测试通过

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/ai/tools/handlers/file-ops.ts apps/web/src/features/ai/tools/__tests__/file-ops.test.ts
git commit -m "feat(ai): implement FileOpsHandler with list/create/delete/move/rename/copy"
```

---

## Task 5: 实现 DocReadHandler

**Files:**
- Create: `apps/web/src/features/ai/tools/handlers/doc-read.ts`
- Create: `apps/web/src/features/ai/tools/__tests__/doc-read.test.ts`

- [ ] **Step 1: 写 doc-read handler 测试**

创建 `apps/web/src/features/ai/tools/__tests__/doc-read.test.ts`：

```typescript
import { describe, expect, it, vi } from 'vitest';
import { DocReadHandler } from '../handlers/doc-read';

function createMocks() {
    const documentStore = {
        get: vi.fn(),
        getByPath: vi.fn(),
    };
    const editorContainer = {
        getService: vi.fn(),
    };
    const fileSystemService = {
        readFile: vi.fn(),
    };
    return { documentStore, editorContainer, fileSystemService };
}

describe('DocReadHandler', () => {
    const { documentStore, editorContainer, fileSystemService } = createMocks();
    const handler = new DocReadHandler(
        documentStore as any,
        editorContainer as any,
        fileSystemService as any,
    );

    it('name 和 type 正确', () => {
        expect(handler.name).toBe('doc_read');
        expect(handler.type).toBe('read');
    });

    describe('text 格式 — 已打开文档', () => {
        it('读取完整内容', async () => {
            documentStore.get.mockReturnValue({ id: 'doc1', path: 'memory://test/doc.km', title: 'Test' });
            editorContainer.getService.mockReturnValue({
                getFullContent: () => 'line1\nline2\nline3',
            });

            const result = await handler.execute({ documentId: 'doc1', format: 'text' });

            expect(result.success).toBe(true);
            expect(result.content).toBe('line1\nline2\nline3');
            expect(result.totalLines).toBe(3);
        });

        it('按行范围读取', async () => {
            documentStore.get.mockReturnValue({ id: 'doc1', path: 'memory://test/doc.km', title: 'Test' });
            editorContainer.getService.mockReturnValue({
                getFullContent: () => 'line1\nline2\nline3\nline4',
            });

            const result = await handler.execute({
                documentId: 'doc1',
                format: 'text',
                rangeType: 'text-range',
                startLine: 2,
                endLine: 3,
            });

            expect(result.success).toBe(true);
            expect(result.content).toBe('line2\nline3');
        });
    });

    describe('text 格式 — 未打开文档', () => {
        it('通过 path 读取', async () => {
            documentStore.getByPath.mockReturnValue(undefined);
            fileSystemService.readFile.mockResolvedValue(
                JSON.stringify({
                    version: 1,
                    metadata: { title: 'Test Doc' },
                    blocks: [
                        { type: 'paragraph', content: { inline: [{ text: 'Hello world' }] } },
                    ],
                }),
            );

            const result = await handler.execute({
                path: 'memory://test/doc.km',
                format: 'text',
            });

            expect(result.success).toBe(true);
            expect(result.content).toContain('Hello world');
        });
    });

    describe('blocks 格式', () => {
        it('返回结构化 block 数据', async () => {
            documentStore.get.mockReturnValue({ id: 'doc1', path: 'memory://test/doc.km', title: 'Test' });
            fileSystemService.readFile.mockResolvedValue(
                JSON.stringify({
                    version: 1,
                    metadata: { title: 'Test Doc' },
                    blocks: [
                        { type: 'paragraph', content: { inline: [{ text: 'Hello' }] } },
                        { type: 'heading', content: { inline: [{ text: 'Title' }], level: 1 } },
                    ],
                }),
            );

            const result = await handler.execute({
                documentId: 'doc1',
                format: 'blocks',
            });

            expect(result.success).toBe(true);
            expect(result.blocks).toHaveLength(2);
            expect(result.blocks![0].type).toBe('paragraph');
            expect(result.blocks![1].type).toBe('heading');
        });

        it('按 block 索引范围读取', async () => {
            documentStore.get.mockReturnValue({ id: 'doc1', path: 'memory://test/doc.km', title: 'Test' });
            fileSystemService.readFile.mockResolvedValue(
                JSON.stringify({
                    version: 1,
                    metadata: {},
                    blocks: [
                        { type: 'paragraph', content: { inline: [{ text: 'A' }] } },
                        { type: 'paragraph', content: { inline: [{ text: 'B' }] } },
                        { type: 'paragraph', content: { inline: [{ text: 'C' }] } },
                    ],
                }),
            );

            const result = await handler.execute({
                documentId: 'doc1',
                format: 'blocks',
                rangeType: 'blocks',
                blockStart: 1,
                blockEnd: 3,
            });

            expect(result.success).toBe(true);
            expect(result.blocks).toHaveLength(2);
        });
    });

    describe('describe()', () => {
        it('返回可读描述', () => {
            const desc = handler.describe({ documentId: 'doc1', format: 'text' });
            expect(desc).toContain('doc1');
            expect(desc).toContain('text');
        });
    });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd apps/web && pnpm test -- --run src/features/ai/tools/__tests__/doc-read.test.ts`
Expected: FAIL — `DocReadHandler` 不存在

- [ ] **Step 3: 实现 DocReadHandler**

创建 `apps/web/src/features/ai/tools/handlers/doc-read.ts`：

```typescript
import { deserializeFromKmFile } from '@/features/editor/converter/km-serializer';
import type { DocumentStore } from '@/platform/document-store/service';
import type { EditorContainer } from '@/platform/editor/container/editor-container';
import type { FileSystemService } from '@/platform/file-system/service';
import { kmFileToPlainText } from '../km-text';
import type { FrontendToolHandler, ToolResult } from '../types';

/**
 * DocReadHandler — doc_read 工具处理器
 *
 * 支持三种输出格式：text（纯文本）、blocks（结构化 JSON）、raw（原始 .km JSON）。
 * 支持三种范围：full、blocks（按索引/ID）、text-range（按行号）。
 */
export class DocReadHandler implements FrontendToolHandler {
    readonly name = 'doc_read';
    readonly type = 'read';

    constructor(
        private readonly documentStore: DocumentStore,
        private readonly editorContainer: EditorContainer,
        private readonly fileSystemService: FileSystemService,
    ) {}

    describe(args: Record<string, unknown>): string {
        const target = args.documentId
            ? `文档 ${String(args.documentId)}`
            : `文件 ${String(args.path ?? '')}`;
        const format = String(args.format ?? 'text');
        return `读取 ${target}（格式: ${format}）`;
    }

    async execute(args: Record<string, unknown>): Promise<ToolResult> {
        const format = (args.format as string) || 'text';
        const rangeType = (args.rangeType as string) || 'full';

        // 解析目标文档
        const target = this.resolveTarget(args);
        if ('error' in target) return target;

        try {
            const { rawString, meta, blocks } = await this.loadDocument(target);

            switch (format) {
                case 'raw':
                    return { success: true, content: rawString, format: 'raw' };
                case 'blocks':
                    return this.formatBlocks(blocks, meta, rangeType, args);
                case 'text':
                default:
                    return this.formatText(rawString, meta, rangeType, args, target);
            }
        } catch (err) {
            return {
                success: false,
                error: `Failed to read document: ${(err as Error).message}`,
            };
        }
    }

    private resolveTarget(
        args: Record<string, unknown>,
    ): { documentId: string; path: string; openEditor: boolean } | ToolResult {
        const documentId = args.documentId as string | undefined;
        const path = args.path as string | undefined;

        if (documentId) {
            const meta = this.documentStore.get(documentId);
            if (!meta) return { success: false, error: `Document not found: ${documentId}` };
            const editor = this.editorContainer.getService(documentId);
            return { documentId, path: meta.path, openEditor: !!editor };
        }

        if (path) {
            const meta = this.documentStore.getByPath(path);
            if (meta) {
                const editor = this.editorContainer.getService(meta.id);
                return { documentId: meta.id, path: meta.path, openEditor: !!editor };
            }
            return { documentId: '', path, openEditor: false };
        }

        return { success: false, error: 'Either documentId or path is required' };
    }

    private async loadDocument(target: { path: string; openEditor: boolean; documentId: string }) {
        const meta = target.documentId ? this.documentStore.get(target.documentId) : undefined;
        const raw = await this.fileSystemService.readFile(target.path);
        const rawString = typeof raw === 'string' ? raw : new TextDecoder().decode(raw);
        const parsed = deserializeFromKmFile(rawString);

        return {
            rawString,
            meta: meta ?? { title: parsed.metadata?.title ?? '', id: '', path: target.path, type: 'km' as const },
            blocks: parsed.blocks,
        };
    }

    private formatText(
        rawString: string,
        meta: { title: string; id: string; path: string },
        rangeType: string,
        args: Record<string, unknown>,
        target: { documentId: string },
    ): ToolResult {
        // 如果有打开的编辑器，优先从编辑器获取
        const editor = target.documentId ? this.editorContainer.getService(target.documentId) : null;
        let fullText: string;

        if (editor) {
            fullText = editor.getFullContent();
        } else {
            fullText = kmFileToPlainText(rawString);
        }

        const lines = fullText.split('\n');
        const totalLines = lines.length;

        if (rangeType === 'text-range') {
            const startLine = typeof args.startLine === 'number' ? args.startLine : 1;
            const endLine = typeof args.endLine === 'number' ? args.endLine : totalLines;
            const sliced = lines.slice(startLine - 1, endLine);
            return {
                success: true,
                content: sliced.join('\n'),
                totalLines,
                startLine,
                endLine: Math.min(endLine, totalLines),
                documentId: target.documentId,
                title: meta.title,
                format: 'text',
            };
        }

        return {
            success: true,
            content: fullText,
            totalLines,
            startLine: 1,
            endLine: totalLines,
            documentId: target.documentId,
            title: meta.title,
            format: 'text',
        };
    }

    private formatBlocks(
        blocks: any[],
        meta: { title: string; id: string; path: string },
        rangeType: string,
        args: Record<string, unknown>,
    ): ToolResult {
        let resultBlocks = blocks;

        if (rangeType === 'blocks') {
            const blockIds = args.blockIds as string[] | undefined;
            if (blockIds) {
                resultBlocks = blocks.filter((b: any) => blockIds.includes(b.id));
            } else {
                const blockStart = typeof args.blockStart === 'number' ? args.blockStart : 0;
                const blockEnd = typeof args.blockEnd === 'number' ? args.blockEnd : blocks.length;
                resultBlocks = blocks.slice(blockStart, blockEnd);
            }
        }

        return {
            success: true,
            blocks: resultBlocks,
            totalBlocks: blocks.length,
            documentId: meta.id,
            title: meta.title,
            format: 'blocks',
        };
    }
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `cd apps/web && pnpm test -- --run src/features/ai/tools/__tests__/doc-read.test.ts`
Expected: 所有测试通过

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/ai/tools/handlers/doc-read.ts apps/web/src/features/ai/tools/__tests__/doc-read.test.ts
git commit -m "feat(ai): implement DocReadHandler with text/blocks/raw formats"
```

---

## Task 6: 实现 DocEditHandler — text 操作

**Files:**
- Create: `apps/web/src/features/ai/tools/handlers/doc-edit.ts`
- Create: `apps/web/src/features/ai/tools/__tests__/doc-edit.test.ts`

此 Task 先实现 `splice-text` 和 `insert-text` 操作（兼容现有工具能力），作为 doc_edit 的基础。

- [ ] **Step 1: 写 doc-edit handler 测试**

创建 `apps/web/src/features/ai/tools/__tests__/doc-edit.test.ts`：

```typescript
import { describe, expect, it, vi } from 'vitest';
import { DocEditHandler } from '../handlers/doc-edit';

function createMocks() {
    const documentStore = {
        get: vi.fn(),
        getByPath: vi.fn(),
    };
    const editorContainer = {
        getService: vi.fn(),
    };
    const fileSystemService = {
        readFile: vi.fn(),
        writeFile: vi.fn(),
    };
    return { documentStore, editorContainer, fileSystemService };
}

describe('DocEditHandler', () => {
    const { documentStore, editorContainer, fileSystemService } = createMocks();
    const handler = new DocEditHandler(
        documentStore as any,
        editorContainer as any,
        fileSystemService as any,
    );

    it('name 和 type 正确', () => {
        expect(handler.name).toBe('doc_edit');
        expect(handler.type).toBe('write');
    });

    describe('splice-text 操作', () => {
        it('对已打开文档执行 splice', async () => {
            documentStore.get.mockReturnValue({ id: 'doc1', path: 'memory://test/doc.km', title: 'Test' });
            editorContainer.getService.mockReturnValue({
                spliceText: vi.fn().mockReturnValue({
                    success: true,
                    charsDeleted: 5,
                    charsInserted: 7,
                }),
            });

            const result = await handler.execute({
                documentId: 'doc1',
                operationType: 'splice-text',
                position: 10,
                deleteCount: 5,
                text: 'new text',
            });

            expect(result.success).toBe(true);
            expect(result.charsDeleted).toBe(5);
            expect(result.charsInserted).toBe(7);
        });
    });

    describe('insert-text 操作', () => {
        it('在文档末尾插入文本', async () => {
            documentStore.get.mockReturnValue({ id: 'doc1', path: 'memory://test/doc.km', title: 'Test' });
            editorContainer.getService.mockReturnValue({
                getFullContent: () => 'existing text',
                spliceText: vi.fn().mockReturnValue({
                    success: true,
                    charsDeleted: 0,
                    charsInserted: 11,
                }),
                insertTextAtCursor: vi.fn(),
            });

            const result = await handler.execute({
                documentId: 'doc1',
                operationType: 'insert-text',
                text: ' appended!',
            });

            expect(result.success).toBe(true);
        });
    });

    describe('describe()', () => {
        it('返回 splice-text 描述', () => {
            const desc = handler.describe({
                documentId: 'doc1',
                operationType: 'splice-text',
                position: 10,
                deleteCount: 5,
                text: 'new',
            });
            expect(desc).toContain('splice-text');
        });

        it('返回 insert-text 描述', () => {
            const desc = handler.describe({
                documentId: 'doc1',
                operationType: 'insert-text',
                text: 'hello',
            });
            expect(desc).toContain('insert-text');
        });
    });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd apps/web && pnpm test -- --run src/features/ai/tools/__tests__/doc-edit.test.ts`
Expected: FAIL — `DocEditHandler` 不存在

- [ ] **Step 3: 实现 DocEditHandler（text 操作）**

创建 `apps/web/src/features/ai/tools/handlers/doc-edit.ts`：

```typescript
import {
    deserializeFromKmFile,
    serializeToKmFile,
} from '@/features/editor/converter/km-serializer';
import type { DocumentStore } from '@/platform/document-store/service';
import type { EditorContainer } from '@/platform/editor/container/editor-container';
import type { FileSystemService } from '@/platform/file-system/service';
import { kmFileToPlainText } from '../km-text';
import type { FrontendToolHandler, ToolResult } from '../types';

/**
 * DocEditHandler — doc_edit 工具处理器
 *
 * 统一的文档编辑入口。当前实现 text 级别操作（splice-text, insert-text）。
 * Block 和 inline 级别操作将在后续计划中实现。
 */
export class DocEditHandler implements FrontendToolHandler {
    readonly name = 'doc_edit';
    readonly type = 'write';

    constructor(
        private readonly documentStore: DocumentStore,
        private readonly editorContainer: EditorContainer,
        private readonly fileSystemService: FileSystemService,
    ) {}

    describe(args: Record<string, unknown>): string {
        const opType = String(args.operationType ?? '');
        const target = args.documentId ? `文档 ${String(args.documentId)}` : `文件 ${String(args.path ?? '')}`;

        switch (opType) {
            case 'splice-text': {
                const pos = Number(args.position ?? 0);
                const del = Number(args.deleteCount ?? 0);
                const preview = String(args.text ?? '').slice(0, 30);
                return `在 ${target} 位置 ${pos} 删除 ${del} 字符并插入 "${preview}"`;
            }
            case 'insert-text': {
                const preview = String(args.text ?? '').slice(0, 40);
                return `在 ${target} 插入文本：${preview}`;
            }
            default:
                return `在 ${target} 执行 ${opType} 操作`;
        }
    }

    async execute(args: Record<string, unknown>): Promise<ToolResult> {
        const opType = args.operationType as string;
        if (!opType) return { success: false, error: 'operationType is required' };

        const target = this.resolveTarget(args);
        if ('error' in target) return target;

        switch (opType) {
            case 'splice-text':
                return this.handleSpliceText(target, args);
            case 'insert-text':
                return this.handleInsertText(target, args);
            default:
                return { success: false, error: `Unsupported operation: ${opType}` };
        }
    }

    private resolveTarget(
        args: Record<string, unknown>,
    ): { documentId: string; path: string; hasEditor: boolean } | ToolResult {
        const documentId = args.documentId as string | undefined;
        const path = args.path as string | undefined;

        if (documentId) {
            const meta = this.documentStore.get(documentId);
            if (!meta) return { success: false, error: `Document not found: ${documentId}` };
            const editor = this.editorContainer.getService(documentId);
            return { documentId, path: meta.path, hasEditor: !!editor };
        }

        if (path) {
            const meta = this.documentStore.getByPath(path);
            if (meta) {
                const editor = this.editorContainer.getService(meta.id);
                return { documentId: meta.id, path: meta.path, hasEditor: !!editor };
            }
            return { documentId: '', path, hasEditor: false };
        }

        return { success: false, error: 'Either documentId or path is required' };
    }

    private async handleSpliceText(
        target: { documentId: string; path: string; hasEditor: boolean },
        args: Record<string, unknown>,
    ): Promise<ToolResult> {
        const position = typeof args.position === 'number' ? args.position : undefined;
        const deleteCount = typeof args.deleteCount === 'number' ? args.deleteCount : undefined;
        const text = typeof args.text === 'string' ? args.text : undefined;

        if (position === undefined) return { success: false, error: 'position is required for splice-text' };
        if (deleteCount === undefined) return { success: false, error: 'deleteCount is required for splice-text' };

        if (target.hasEditor) {
            const editor = this.editorContainer.getService(target.documentId)!;
            const result = editor.spliceText(position, deleteCount, text);
            if (!result.success) return { success: false, error: result.error };
            return {
                success: true,
                documentId: target.documentId,
                charsDeleted: result.charsDeleted,
                charsInserted: result.charsInserted,
            };
        }

        // 未打开文档：读 .km → splice → 写回
        return this.spliceOnFile(target, position, deleteCount, text);
    }

    private async handleInsertText(
        target: { documentId: string; path: string; hasEditor: boolean },
        args: Record<string, unknown>,
    ): Promise<ToolResult> {
        const text = typeof args.text === 'string' ? args.text : undefined;
        if (text === undefined) return { success: false, error: 'text is required for insert-text' };

        if (target.hasEditor) {
            const editor = this.editorContainer.getService(target.documentId)!;
            const fullText = editor.getFullContent();
            const result = editor.spliceText(fullText.length, 0, text);
            if (!result.success) return { success: false, error: result.error };
            return { success: true, documentId: target.documentId };
        }

        // 未打开文档：追加到末尾
        return this.spliceOnFile(target, -1, 0, text);
    }

    private async spliceOnFile(
        target: { documentId: string; path: string },
        start: number,
        deleteCount: number,
        insert?: string,
    ): Promise<ToolResult> {
        const raw = await this.fileSystemService.readFile(target.path);
        const rawString = typeof raw === 'string' ? raw : new TextDecoder().decode(raw);
        const { metadata, blocks } = deserializeFromKmFile(rawString);
        const fullText = kmFileToPlainText(rawString);

        // start=-1 表示追加到末尾
        const actualStart = start === -1 ? fullText.length : start;

        if (actualStart < 0 || actualStart > fullText.length) {
            return { success: false, error: `Position ${actualStart} out of bounds (length: ${fullText.length})` };
        }

        const actualDeleteCount = Math.max(0, Math.min(deleteCount, fullText.length - actualStart));
        const insertText = insert ?? '';
        const newText = fullText.slice(0, actualStart) + insertText + fullText.slice(actualStart + actualDeleteCount);

        // 按 \n 拆分为段落 blocks 写回
        const lines = newText.length === 0 ? [''] : newText.split('\n');
        const newBlocks = lines.map(line => ({
            type: 'paragraph' as const,
            // biome-ignore lint/suspicious/noExplicitAny: Block.content union
            content: { inline: line ? [{ text: line }] : [] } as any,
        }));
        const newContent = serializeToKmFile(newBlocks as never, {
            title: metadata.title,
            createdAt: metadata.createdAt,
            updatedAt: new Date().toISOString(),
            custom: metadata.custom,
        });
        await this.fileSystemService.writeFile(target.path, newContent);

        return {
            success: true,
            documentId: target.documentId,
            charsDeleted: actualDeleteCount,
            charsInserted: insertText.length,
        };
    }
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `cd apps/web && pnpm test -- --run src/features/ai/tools/__tests__/doc-edit.test.ts`
Expected: 所有测试通过

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/ai/tools/handlers/doc-edit.ts apps/web/src/features/ai/tools/__tests__/doc-edit.test.ts
git commit -m "feat(ai): implement DocEditHandler with splice-text and insert-text operations"
```

---

## Task 7: 实现 SearchHandler（text 模式）

**Files:**
- Create: `apps/web/src/features/ai/tools/handlers/search.ts`
- Create: `apps/web/src/features/ai/tools/__tests__/search.test.ts`

此 Task 先实现前端纯文本搜索（`text` 和 `grep` 模式），`metadata` 和 `semantic` 模式需要后端支持，后续计划实现。

- [ ] **Step 1: 写 search handler 测试**

创建 `apps/web/src/features/ai/tools/__tests__/search.test.ts`：

```typescript
import { describe, expect, it, vi } from 'vitest';
import { SearchHandler } from '../handlers/search';

function createMocks() {
    const documentStore = {
        get: vi.fn(),
        getByPath: vi.fn(),
        getAll: vi.fn(),
    };
    const editorContainer = {
        getService: vi.fn(),
    };
    const fileSystemService = {
        readFile: vi.fn(),
        listFiles: vi.fn(),
    };
    const getProjectRoot = vi.fn().mockReturnValue('memory://test-project');
    return { documentStore, editorContainer, fileSystemService, getProjectRoot };
}

describe('SearchHandler', () => {
    const { documentStore, editorContainer, fileSystemService, getProjectRoot } = createMocks();
    const handler = new SearchHandler(
        documentStore as any,
        editorContainer as any,
        fileSystemService as any,
        getProjectRoot,
    );

    it('name 和 type 正确', () => {
        expect(handler.name).toBe('search');
        expect(handler.type).toBe('read');
    });

    describe('text 模式', () => {
        it('在单个文档内搜索', async () => {
            documentStore.get.mockReturnValue({ id: 'doc1', path: 'memory://test/doc.km', title: 'Test' });
            editorContainer.getService.mockReturnValue({
                getFullContent: () => 'Hello world\nHello again\nGoodbye',
            });

            const result = await handler.execute({
                type: 'text',
                query: 'Hello',
                documentId: 'doc1',
            });

            expect(result.success).toBe(true);
            expect(result.matches!.length).toBe(2);
            expect(result.totalMatches).toBe(2);
        });

        it('找不到匹配', async () => {
            documentStore.get.mockReturnValue({ id: 'doc1', path: 'memory://test/doc.km', title: 'Test' });
            editorContainer.getService.mockReturnValue({
                getFullContent: () => 'Hello world',
            });

            const result = await handler.execute({
                type: 'text',
                query: 'xyz',
                documentId: 'doc1',
            });

            expect(result.success).toBe(true);
            expect(result.matches).toHaveLength(0);
            expect(result.totalMatches).toBe(0);
        });
    });

    describe('grep 模式', () => {
        it('返回不支持提示（后续实现）', async () => {
            const result = await handler.execute({
                type: 'grep',
                query: 'TODO',
            });

            // grep 模式暂时返回 not-supported
            expect(result.success).toBe(false);
            expect(result.error).toContain('grep');
        });
    });

    describe('describe()', () => {
        it('返回可读描述', () => {
            const desc = handler.describe({ type: 'text', query: 'Hello' });
            expect(desc).toContain('text');
            expect(desc).toContain('Hello');
        });
    });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd apps/web && pnpm test -- --run src/features/ai/tools/__tests__/search.test.ts`
Expected: FAIL — `SearchHandler` 不存在

- [ ] **Step 3: 实现 SearchHandler**

创建 `apps/web/src/features/ai/tools/handlers/search.ts`：

```typescript
import type { DocumentStore } from '@/platform/document-store/service';
import type { EditorContainer } from '@/platform/editor/container/editor-container';
import type { FileSystemService } from '@/platform/file-system/service';
import type { FrontendToolHandler, ToolResult } from '../types';

/**
 * SearchHandler — search 工具处理器
 *
 * 当前实现：
 * - text: 单文档内文本搜索（前端实现）
 *
 * 后续计划实现：
 * - grep: 跨文件文本搜索（需要后端 API）
 * - metadata: 结构化搜索（需要数据库查询）
 * - semantic: 语义搜索（需要 pgvector）
 */
export class SearchHandler implements FrontendToolHandler {
    readonly name = 'search';
    readonly type = 'read';

    constructor(
        private readonly documentStore: DocumentStore,
        private readonly editorContainer: EditorContainer,
        private readonly fileSystemService: FileSystemService,
        private readonly getProjectRoot: () => string | null,
    ) {}

    describe(args: Record<string, unknown>): string {
        const type = String(args.type ?? '');
        const query = String(args.query ?? '');
        return `搜索（${type}模式）："${query}"`;
    }

    async execute(args: Record<string, unknown>): Promise<ToolResult> {
        const type = args.type as string;
        const query = args.query as string;

        if (!query) return { success: false, error: 'query is required' };

        switch (type) {
            case 'text':
                return this.handleTextSearch(query, args);
            case 'grep':
            case 'metadata':
            case 'semantic':
                return {
                    success: false,
                    error: `"${type}" search mode is not yet implemented. Currently only "text" mode is available.`,
                };
            default:
                return { success: false, error: `Unknown search type: ${type}` };
        }
    }

    private async handleTextSearch(query: string, args: Record<string, unknown>): Promise<ToolResult> {
        const documentId = args.documentId as string | undefined;
        const path = args.path as string | undefined;

        let content: string;

        if (documentId) {
            const editor = this.editorContainer.getService(documentId);
            if (editor) {
                content = editor.getFullContent();
            } else {
                const meta = this.documentStore.get(documentId);
                if (!meta) return { success: false, error: `Document not found: ${documentId}` };
                content = await this.readFileContent(meta.path);
            }
        } else if (path) {
            content = await this.readFileContent(path);
        } else {
            return { success: false, error: 'documentId or path is required for text search' };
        }

        const caseSensitive = args.caseSensitive === true;
        const maxResults = typeof args.maxResults === 'number' ? args.maxResults : 20;
        const includeContent = args.includeContent !== false;

        const matches = this.findMatches(content, query, caseSensitive, maxResults, includeContent);

        return {
            success: true,
            matches,
            totalMatches: matches.length,
            truncated: matches.length >= maxResults,
        };
    }

    private findMatches(
        content: string,
        query: string,
        caseSensitive: boolean,
        maxResults: number,
        includeContent: boolean,
    ): Array<{ line: number; column: number; snippet?: string }> {
        const lines = content.split('\n');
        const matches: Array<{ line: number; column: number; snippet?: string }> = [];
        const searchQuery = caseSensitive ? query : query.toLowerCase();

        for (let i = 0; i < lines.length && matches.length < maxResults; i++) {
            const line = caseSensitive ? lines[i] : lines[i].toLowerCase();
            let searchFrom = 0;

            while (searchFrom < line.length) {
                const idx = line.indexOf(searchQuery, searchFrom);
                if (idx === -1) break;

                matches.push({
                    line: i + 1,
                    column: idx + 1,
                    snippet: includeContent ? lines[i] : undefined,
                });

                if (matches.length >= maxResults) break;
                searchFrom = idx + 1;
            }
        }

        return matches;
    }

    private async readFileContent(path: string): Promise<string> {
        const raw = await this.fileSystemService.readFile(path);
        const rawString = typeof raw === 'string' ? raw : new TextDecoder().decode(raw);
        // 简单提取文本 — 如果需要更精确可以复用 kmFileToPlainText
        try {
            const parsed = JSON.parse(rawString);
            if (parsed.blocks) {
                return parsed.blocks
                    .map((b: any) => {
                        if (b.content?.inline) {
                            return b.content.inline.map((i: any) => i.text ?? '').join('');
                        }
                        if (b.content?.code) return b.content.code;
                        return '';
                    })
                    .join('\n');
            }
        } catch {
            // 不是 JSON，返回原始文本
        }
        return rawString;
    }
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `cd apps/web && pnpm test -- --run src/features/ai/tools/__tests__/search.test.ts`
Expected: 所有测试通过

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/ai/tools/handlers/search.ts apps/web/src/features/ai/tools/__tests__/search.test.ts
git commit -m "feat(ai): implement SearchHandler with text search mode"
```

---

## Task 8: 更新 FrontendToolExecutor 集成策略系统

**Files:**
- Modify: `apps/web/src/features/ai/tools/frontend-tool-executor.ts`
- Modify: `apps/web/src/features/ai/tools/types.ts`

- [ ] **Step 1: 扩展 types.ts — 增加 handler 分类支持**

在 `apps/web/src/features/ai/tools/types.ts` 末尾添加：

```typescript
/**
 * 工具操作类别 — 用于确认策略判断
 */
export type ToolCategory = 'read' | 'write';

/**
 * 判断工具是否为只读操作
 * 需要结合工具名和具体操作参数判断
 */
export type NeedsConfirmationFn = (toolName: string, input: Record<string, unknown>) => boolean;
```

- [ ] **Step 2: 更新 FrontendToolExecutor 集成策略**

替换 `apps/web/src/features/ai/tools/frontend-tool-executor.ts` 全部内容：

```typescript
import { Emitter, type Event } from '@/base/common/event';
import {
    createConfirmationStrategy,
    type ConfirmationMode,
    type ConfirmationStrategy,
} from './confirmation-strategy';
import type { ConfirmationRequest, FrontendToolHandler, ToolResult } from './types';

/**
 * FrontendToolExecutor
 *
 * 负责：
 * 1. 注册前端工具 handler
 * 2. 根据确认策略决定是否需要用户确认：
 *    - bypass: 所有操作自动执行
 *    - confirm-write: 写操作需确认（默认）
 *    - confirm-all: 所有操作需确认
 *    - confirm-destructive: 仅破坏性操作需确认
 * 3. 把执行结果作为 ToolResult 返回给调用方（再由调用方 resumeWithToolResult）
 *
 * 不直接处理 SSE/interrupt 协议；由消费方（AIPanel）订阅 interrupt 并调用 dispatch。
 */
export class FrontendToolExecutor {
    private readonly handlers = new Map<string, FrontendToolHandler>();
    private readonly _onConfirmationRequest = new Emitter<ConfirmationRequest>();
    readonly onConfirmationRequest: Event<ConfirmationRequest> = this._onConfirmationRequest.event;

    private strategy: ConfirmationStrategy;

    constructor(mode: ConfirmationMode = 'confirm-write') {
        this.strategy = createConfirmationStrategy(mode);
    }

    /** 切换确认策略模式 */
    setStrategy(mode: ConfirmationMode): void {
        this.strategy = createConfirmationStrategy(mode);
    }

    /** 获取当前策略模式 */
    getStrategyMode(): ConfirmationMode {
        return this.strategy.mode;
    }

    register(handler: FrontendToolHandler): void {
        this.handlers.set(handler.name, handler);
    }

    async dispatch(toolName: string, input: Record<string, unknown>): Promise<ToolResult> {
        const handler = this.handlers.get(toolName);
        if (!handler) {
            return { success: false, error: `Unknown tool: ${toolName}` };
        }

        try {
            if (this.strategy.needsConfirmation(toolName, input)) {
                const approved = await this.requestConfirmation(handler, input);
                if (!approved) {
                    return { success: false, error: 'User rejected the operation' };
                }
            }
            return await handler.execute(input);
        } catch (err) {
            return {
                success: false,
                error: err instanceof Error ? err.message : String(err),
            };
        }
    }

    private requestConfirmation(
        handler: FrontendToolHandler,
        input: Record<string, unknown>,
    ): Promise<boolean> {
        return new Promise(resolve => {
            this._onConfirmationRequest.fire({
                toolName: handler.name,
                input,
                description: handler.describe(input),
                resolve,
            });
        });
    }

    dispose(): void {
        this._onConfirmationRequest.dispose();
        this.handlers.clear();
    }
}
```

- [ ] **Step 3: 验证编译**

Run: `cd apps/web && pnpm build`
Expected: 编译成功

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/features/ai/tools/frontend-tool-executor.ts apps/web/src/features/ai/tools/types.ts
git commit -m "feat(ai): integrate confirmation strategy into FrontendToolExecutor"
```

---

## Task 9: 更新 AI Panel 集成 + 清理旧工具

**Files:**
- Modify: `apps/web/src/components/workspace/ai-panel/ai-panel.tsx`
- Delete: `apps/web/src/features/ai/tools/handlers/get-document-content.ts`
- Delete: `apps/web/src/features/ai/tools/handlers/get-child-items.ts`
- Delete: `apps/web/src/features/ai/tools/handlers/insert-text.ts`
- Delete: `apps/web/src/features/ai/tools/handlers/splice-text.ts`

- [ ] **Step 1: 定位 ai-panel.tsx 中的工具注册代码**

在 `apps/web/src/components/workspace/ai-panel/ai-panel.tsx` 中找到 `toolExecutor` 的 `useMemo` 块。它目前看起来类似：

```typescript
const toolExecutor = useMemo(() => {
    const { documentStore, editorContainer, fileSystemService } = container;
    const getProjectRoot = () => {
        const project = useWorkspaceStore.getState().project.currentProject;
        return project ? `memory://${project.name}` : null;
    };

    const exec = new FrontendToolExecutor();
    exec.register(new GetDocumentContentHandler(documentStore, editorContainer, fileSystemService));
    exec.register(new GetChildItemsHandler(fileSystemService, getProjectRoot));
    exec.register(new InsertTextHandler(documentStore, editorContainer, fileSystemService));
    exec.register(new SpliceTextHandler(documentStore, editorContainer, fileSystemService));
    return exec;
}, []);
```

- [ ] **Step 2: 更新 import 语句**

替换旧的 handler import：

```typescript
// 删除旧 imports:
// import { GetDocumentContentHandler } from '@/features/ai/tools/handlers/get-document-content';
// import { GetChildItemsHandler } from '@/features/ai/tools/handlers/get-child-items';
// import { InsertTextHandler } from '@/features/ai/tools/handlers/insert-text';
// import { SpliceTextHandler } from '@/features/ai/tools/handlers/splice-text';

// 添加新 imports:
import { FileOpsHandler } from '@/features/ai/tools/handlers/file-ops';
import { DocReadHandler } from '@/features/ai/tools/handlers/doc-read';
import { DocEditHandler } from '@/features/ai/tools/handlers/doc-edit';
import { SearchHandler } from '@/features/ai/tools/handlers/search';
```

- [ ] **Step 3: 更新 toolExecutor 注册**

替换 `toolExecutor` 的 `useMemo` 块：

```typescript
const toolExecutor = useMemo(() => {
    const { documentStore, editorContainer, fileSystemService } = container;
    const getProjectRoot = () => {
        const project = useWorkspaceStore.getState().project.currentProject;
        return project ? `memory://${project.name}` : null;
    };

    const exec = new FrontendToolExecutor('confirm-write');
    exec.register(new FileOpsHandler(fileSystemService, getProjectRoot));
    exec.register(new DocReadHandler(documentStore, editorContainer, fileSystemService));
    exec.register(new DocEditHandler(documentStore, editorContainer, fileSystemService));
    exec.register(new SearchHandler(documentStore, editorContainer, fileSystemService, getProjectRoot));
    return exec;
}, []);
```

- [ ] **Step 4: 删除旧 handler 文件**

```bash
rm apps/web/src/features/ai/tools/handlers/get-document-content.ts
rm apps/web/src/features/ai/tools/handlers/get-child-items.ts
rm apps/web/src/features/ai/tools/handlers/insert-text.ts
rm apps/web/src/features/ai/tools/handlers/splice-text.ts
```

- [ ] **Step 5: 验证编译**

Run: `cd apps/web && pnpm build`
Expected: 编译成功，无引用旧文件的错误

- [ ] **Step 6: 运行所有新工具测试**

Run: `cd apps/web && pnpm test -- --run src/features/ai/tools/__tests__/`
Expected: 所有测试通过

- [ ] **Step 7: Commit**

```bash
git add -A apps/web/src/
git commit -m "feat(ai): integrate new layered tools into AI panel, remove old handlers"
```

---

## Task 10: 端到端验证

**Files:** 无修改

- [ ] **Step 1: 验证 shared 包编译**

Run: `cd packages/shared && pnpm build`
Expected: 成功

- [ ] **Step 2: 验证 server 编译**

Run: `cd apps/server && pnpm build`
Expected: 成功

- [ ] **Step 3: 验证 web 编译**

Run: `cd apps/web && pnpm build`
Expected: 成功

- [ ] **Step 4: 运行所有前端 AI 工具测试**

Run: `cd apps/web && pnpm test -- --run src/features/ai/tools/__tests__/`
Expected: 全部通过

- [ ] **Step 5: 启动开发服务器进行冒烟测试**

Run: `cd apps/web && pnpm dev`

在浏览器中打开应用，测试：
1. 打开一个文档
2. 打开 AI Panel
3. 发送消息要求 AI 列出文件 → 验证 `file_ops(list)` 正常工作
4. 发送消息要求 AI 读取当前文档 → 验证 `doc_read` 正常工作
5. 发送消息要求 AI 插入文本 → 验证 `doc_edit(insert-text)` 正常工作（确认对话框出现）

- [ ] **Step 6: Final commit**

如有任何修复，提交最终更改。

---

## 自检清单

### Spec 覆盖率

| Spec 要求 | 对应 Task |
|-----------|-----------|
| `file_ops` 工具 (list/create/delete/move/rename/copy) | Task 1 (schema) + Task 4 (handler) |
| `doc_read` 工具 (text/blocks/raw 格式) | Task 1 (schema) + Task 5 (handler) |
| `doc_edit` 工具 (splice-text/insert-text) | Task 1 (schema) + Task 6 (handler) |
| `search` 工具 (text 模式) | Task 1 (schema) + Task 7 (handler) |
| 确认策略系统 (4 种模式) | Task 3 |
| FrontendToolExecutor 策略集成 | Task 8 |
| AI Panel 集成 | Task 9 |
| 旧工具清理 | Task 9 |
| `doc_edit` block 级操作 | **计划 B** |
| `doc_edit` inline 级操作 | **计划 B** |
| `search` grep/metadata/semantic | **计划 B** |

### 未覆盖项（留给计划 B）

1. `doc_edit` 的 `insert-block`, `replace-block`, `delete-block`, `move-block` 操作
2. `doc_edit` 的 `format-inline`, `insert-inline` 操作
3. `search` 的 `grep` 模式（跨文件文本搜索，需要后端 API）
4. `search` 的 `metadata` 模式（需要数据库查询 API）
5. `search` 的 `semantic` 模式（需要 pgvector + embedding API）
6. 策略切换 UI 组件
