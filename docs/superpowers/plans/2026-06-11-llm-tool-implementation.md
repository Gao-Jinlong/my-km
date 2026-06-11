# LLM 工具实现 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现 4 个 LLM 工具（`get_document_content`、`get_child_items`、`insert_text`、`splice_text`），让 AI 助手通过 LangGraph interrupt/resume 协议在前端执行工具调用。

**Architecture:** 共享包定义工具 schema，后端 `frontendTools` 数组绑定到 LLM，`tool-node` 通过 `interrupt()` 暂停 graph；前端 `FrontendToolExecutor` 调度 4 个 handler，读操作自动执行，写操作弹出确认 UI，结果通过 `resumeWithToolResult` 回传给 LLM。

**Tech Stack:** TypeScript, Next.js (web), NestJS (server), LangGraph, Lexical, Vitest (web 测试), Jest (server 测试), Biome (lint), Turborepo

设计文档：[`docs/superpowers/specs/2026-06-11-llm-tool-implementation-design.md`](../specs/2026-06-11-llm-tool-implementation-design.md)

---

## File Structure

### 新增文件

```
apps/web/src/features/ai/tools/
├── types.ts                                    ← FrontendToolHandler、ToolResult、ConfirmationRequest 类型
├── frontend-tool-executor.ts                   ← 核心调度器
├── km-text.ts                                  ← .km 文件 → 纯文本工具函数
├── handlers/
│   ├── get-document-content.ts                 ← get_document_content handler
│   ├── get-child-items.ts                      ← get_child_items handler
│   ├── insert-text.ts                          ← insert_text handler
│   └── splice-text.ts                          ← splice_text handler
└── __tests__/
    ├── frontend-tool-executor.test.ts
    ├── km-text.test.ts
    └── handlers/
        ├── get-document-content.test.ts
        ├── get-child-items.test.ts
        ├── insert-text.test.ts
        └── splice-text.test.ts

apps/web/src/components/workspace/ai-panel/
└── tool-confirmation-dialog.tsx                ← 工具确认对话框
```

### 修改文件

```
packages/shared/src/ai/tools/index.ts            ← 更新 schema（重命名/新参数）
packages/shared/src/ai/index.ts                  ← 导出新名称
apps/server/src/ai/tools/tool-definitions.ts     ← 取消注释 frontendTools、更新名称
apps/server/src/__mocks__/@my-km/shared.ts       ← 同步 mock
apps/web/src/features/editor/service/EditorService.ts  ← 添加 spliceText() 方法
apps/web/src/components/workspace/ai-panel/ai-panel.tsx ← 集成 FrontendToolExecutor
```

---

## Phase 1：共享 Schema 和后端绑定

### Task 1: 更新共享 schema

**Files:**
- Modify: `packages/shared/src/ai/tools/index.ts`
- Modify: `packages/shared/src/ai/index.ts`
- Modify: `apps/server/src/__mocks__/@my-km/shared.ts`

- [ ] **Step 1: 重写 `packages/shared/src/ai/tools/index.ts`**

完整覆写文件内容为：

```typescript
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
            documentId: { type: 'string', description: '文档 ID（必填）' },
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
 * 对文档执行 splice 操作（类似 JavaScript String.splice）
 * 从 start 位置删除 deleteCount 个字符，然后插入 insert 文本
 */
export const spliceTextTool = {
    name: 'splice_text',
    description:
        '对文档执行 splice 操作：从 start 位置删除 deleteCount 个字符，然后插入 insert 文本',
    inputSchema: {
        type: 'object',
        properties: {
            documentId: { type: 'string', description: '文档 ID（必填）' },
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
```

- [ ] **Step 2: 更新 `packages/shared/src/ai/index.ts`**

完整覆写文件内容为：

```typescript
export {
    getChildItemsTool,
    getDocumentContentTool,
    insertTextTool,
    spliceTextTool,
} from './tools';
```

- [ ] **Step 3: 更新 mock 文件 `apps/server/src/__mocks__/@my-km/shared.ts`**

完整覆写文件内容为：

```typescript
export const getDocumentContentTool = {
    name: 'get_document_content',
    description: 'Get document content',
    input_schema: { type: 'object', properties: {} },
};

export const getChildItemsTool = {
    name: 'get_child_items',
    description: 'Get child items',
    input_schema: { type: 'object', properties: {} },
};

export const insertTextTool = {
    name: 'insert_text',
    description: 'Insert text',
    input_schema: { type: 'object', properties: {} },
};

export const spliceTextTool = {
    name: 'splice_text',
    description: 'Splice text',
    input_schema: { type: 'object', properties: {} },
};
```

- [ ] **Step 4: 验证 TypeScript 编译**

Run: `cd D:/projects/my-km && pnpm -F @my-km/shared exec tsc --noEmit`
Expected: 无错误输出

- [ ] **Step 5: 提交**

```bash
git add packages/shared/src/ai apps/server/src/__mocks__/@my-km/shared.ts
git commit -m "feat(shared): update LLM tool schemas (rename get_file_tree→get_child_items, replace_text→splice_text)"
```

---

### Task 2: 启用后端 frontendTools 绑定

**Files:**
- Modify: `apps/server/src/ai/tools/tool-definitions.ts`
- Test: `apps/server/src/ai/tools/__tests__/tool-definitions.spec.ts` (Create)

- [ ] **Step 1: 编写失败的测试**

创建 `apps/server/src/ai/tools/__tests__/tool-definitions.spec.ts`：

```typescript
import { FRONTEND_TOOLS, frontendTools, isFrontendTool } from '../tool-definitions';

describe('tool-definitions', () => {
    describe('FRONTEND_TOOLS', () => {
        it('应该包含 4 个工具名', () => {
            expect(FRONTEND_TOOLS.size).toBe(4);
            expect(FRONTEND_TOOLS.has('get_document_content')).toBe(true);
            expect(FRONTEND_TOOLS.has('get_child_items')).toBe(true);
            expect(FRONTEND_TOOLS.has('insert_text')).toBe(true);
            expect(FRONTEND_TOOLS.has('splice_text')).toBe(true);
        });
    });

    describe('frontendTools', () => {
        it('应该包含 4 个 LangChain Tool 实例', () => {
            expect(frontendTools.length).toBe(4);
            const names = frontendTools.map(t => t.name).sort();
            expect(names).toEqual([
                'get_child_items',
                'get_document_content',
                'insert_text',
                'splice_text',
            ]);
        });
    });

    describe('isFrontendTool', () => {
        it('应该识别已知的前端工具', () => {
            expect(isFrontendTool('get_document_content')).toBe(true);
            expect(isFrontendTool('splice_text')).toBe(true);
        });

        it('应该拒绝未知工具', () => {
            expect(isFrontendTool('unknown_tool')).toBe(false);
        });
    });
});
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `cd D:/projects/my-km && pnpm -F server test -- tool-definitions`
Expected: FAIL（`FRONTEND_TOOLS` 有 4 个但 `frontendTools` 为空，且名称不匹配）

- [ ] **Step 3: 修改 `apps/server/src/ai/tools/tool-definitions.ts`**

完整覆写文件内容为：

```typescript
/**
 * ToolDefinitions — 共享 schema 转 LangChain Tool 实例
 *
 * 这些"前端工具"在后端不真正执行：tool-node.ts 通过 LangGraph `interrupt()`
 * 暂停 graph，等待前端通过 SDK `command.resume` 提供结果。
 *
 * `tool()` 工厂在这里只是为了：
 *   1. 给 ChatModel.bindTools() 提供 LangChain Tool 实例
 *   2. 把 JSON Schema(zod-compatible)挂载到工具上，让 LLM 知道工具签名
 */

import { type StructuredToolInterface, tool } from '@langchain/core/tools';
import {
    getChildItemsTool,
    getDocumentContentTool,
    insertTextTool,
    spliceTextTool,
} from '@my-km/shared';
import { z } from 'zod';

/**
 * 前端工具名称集合 — 这些工具需要前端执行，触发 interrupt
 */
export const FRONTEND_TOOLS = new Set([
    'get_document_content',
    'get_child_items',
    'insert_text',
    'splice_text',
]);

/**
 * 把 JSON Schema 包装成最宽松的 zod schema(`z.any()`)
 *
 * 我们不需要真正校验入参(LLM 输出由 ChatModel 自身按工具 schema 校验);
 * 这里只是把工具签名暴露给 bindTools()。
 */
function _makeFrontendTool(def: {
    name: string;
    description: string;
    inputSchema: Record<string, unknown>;
}): StructuredToolInterface {
    return tool(
        async () => {
            // 永远不会执行：tool-node 在 LLM 决定调用前端工具时
            // 通过 interrupt() 暂停 graph，等待前端 resume
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

/**
 * 所有前端工具 — 供 ChatModel.bindTools() 使用
 */
export const frontendTools: StructuredToolInterface[] = [
    _makeFrontendTool(getDocumentContentTool),
    _makeFrontendTool(getChildItemsTool),
    _makeFrontendTool(insertTextTool),
    _makeFrontendTool(spliceTextTool),
];

/**
 * 检查工具是否为前端工具(需要 interrupt)
 */
export function isFrontendTool(toolName: string): boolean {
    return FRONTEND_TOOLS.has(toolName);
}
```

- [ ] **Step 4: 运行测试，确认通过**

Run: `cd D:/projects/my-km && pnpm -F server test -- tool-definitions`
Expected: PASS（3 个测试全部通过）

- [ ] **Step 5: 提交**

```bash
git add apps/server/src/ai/tools/tool-definitions.ts apps/server/src/ai/tools/__tests__/tool-definitions.spec.ts
git commit -m "feat(server): enable frontendTools array with 4 LLM tools

- Bind get_document_content, get_child_items, insert_text, splice_text to ChatModel
- Add unit tests verifying tool registration and isFrontendTool checks"
```

---

## Phase 2：前端类型和共享工具

### Task 3: 定义 FrontendToolHandler 类型

**Files:**
- Create: `apps/web/src/features/ai/tools/types.ts`

- [ ] **Step 1: 创建 `apps/web/src/features/ai/tools/types.ts`**

```typescript
/**
 * 前端 LLM 工具执行相关类型
 *
 * 注意：与 apps/web/src/features/ai/types/ai.types.ts 中的 ToolHandler 不同。
 * 那个接口面向通用的前端工具注册（含 description、inputSchema），
 * 本类型专为 LLM 工具的 interrupt/resume 执行流程设计。
 */

/**
 * 工具执行结果（返回给 LLM 的 ToolMessage 内容）
 */
export interface ToolResult {
    success: boolean;
    error?: string;
    [key: string]: unknown;
}

/**
 * 前端工具处理器接口
 */
export interface FrontendToolHandler {
    /** 工具名称，与 shared schema 中的 name 一致 */
    readonly name: string;
    /**
     * 操作类型：
     * - read 自动执行，无需用户确认
     * - write 需要用户确认后执行
     */
    readonly type: 'read' | 'write';
    /** 执行工具逻辑 */
    execute(args: Record<string, unknown>): Promise<ToolResult>;
    /** 人类可读的操作描述（用于确认 UI 展示） */
    describe(args: Record<string, unknown>): string;
}

/**
 * 工具确认请求（写操作发起时触发，UI 监听并展示对话框）
 */
export interface ConfirmationRequest {
    toolName: string;
    input: Record<string, unknown>;
    description: string;
    /** 用户决定回调（true=确认，false=拒绝） */
    resolve: (approved: boolean) => void;
}
```

- [ ] **Step 2: 验证编译**

Run: `cd D:/projects/my-km && pnpm -F web exec tsc --noEmit`
Expected: 无错误

- [ ] **Step 3: 提交**

```bash
git add apps/web/src/features/ai/tools/types.ts
git commit -m "feat(ai-tools): add FrontendToolHandler and ToolResult types"
```

---

### Task 4: 实现 .km 文件 → 纯文本工具函数

**Files:**
- Create: `apps/web/src/features/ai/tools/km-text.ts`
- Test: `apps/web/src/features/ai/tools/__tests__/km-text.test.ts`

- [ ] **Step 1: 编写失败的测试**

创建 `apps/web/src/features/ai/tools/__tests__/km-text.test.ts`：

```typescript
import { describe, expect, it } from 'vitest';
import { kmFileToPlainText } from '../km-text';

describe('kmFileToPlainText', () => {
    it('应该把 .km 文件的段落 blocks 转换为多行纯文本', () => {
        const raw = JSON.stringify({
            metadata: { version: '1.0.0', createdAt: '', updatedAt: '' },
            content: [
                { type: 'paragraph', content: { inline: [{ text: 'Hello ' }, { text: 'World' }] } },
                { type: 'paragraph', content: { inline: [{ text: 'Second line' }] } },
            ],
        });

        expect(kmFileToPlainText(raw)).toBe('Hello World\nSecond line');
    });

    it('应该处理 heading、quote、code 等 block 类型', () => {
        const raw = JSON.stringify({
            metadata: { version: '1.0.0', createdAt: '', updatedAt: '' },
            content: [
                { type: 'heading', content: { inline: [{ text: 'Title' }] } },
                { type: 'quote', content: { inline: [{ text: 'Quoted' }] } },
                { type: 'code', content: { code: 'const x = 1;' } },
            ],
        });

        expect(kmFileToPlainText(raw)).toBe('Title\nQuoted\nconst x = 1;');
    });

    it('应该把 list 的每个 item 转为单独的行', () => {
        const raw = JSON.stringify({
            metadata: { version: '1.0.0', createdAt: '', updatedAt: '' },
            content: [
                {
                    type: 'list',
                    content: {
                        items: [
                            { inline: [{ text: 'Item 1' }] },
                            { inline: [{ text: 'Item 2' }] },
                        ],
                    },
                },
            ],
        });

        expect(kmFileToPlainText(raw)).toBe('Item 1\nItem 2');
    });

    it('空文件应返回空字符串', () => {
        expect(kmFileToPlainText('')).toBe('');
    });

    it('无效 JSON 应抛出错误', () => {
        expect(() => kmFileToPlainText('not json')).toThrow(/Invalid .km file/);
    });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd D:/projects/my-km && pnpm -F web test -- km-text`
Expected: FAIL（模块未找到）

- [ ] **Step 3: 创建 `apps/web/src/features/ai/tools/km-text.ts`**

```typescript
/**
 * 从 .km 文件原始 JSON 字符串提取纯文本
 *
 * .km 文件结构通过 deserializeFromKmFile 反序列化为 Block[]，
 * 然后按行连接各个 block 的文本内容。
 *
 * 此工具与 DocumentExportService.blocksToPlainText 行为一致，
 * 但提取为独立函数以便 LLM 工具 handler 直接调用，避免循环依赖。
 */

import { deserializeFromKmFile } from '@/features/editor/converter/km-serializer';
// biome-ignore lint/suspicious/noExplicitAny: Block 的 content 字段为联合类型，转换函数中按 type 分发
type AnyBlock = { type: string; content: any };

function inlineToPlainText(inline: Array<{ text: string }>): string {
    return inline.map(item => item.text).join('');
}

function blockToLines(block: AnyBlock): string[] {
    switch (block.type) {
        case 'heading':
        case 'paragraph':
        case 'quote':
            return [inlineToPlainText(block.content.inline)];
        case 'list':
            return (block.content.items as Array<{ inline: Array<{ text: string }> }>).map(item =>
                inlineToPlainText(item.inline),
            );
        case 'code':
            return [block.content.code as string];
        case 'image':
            return [`[图片：${block.content.alt}]`];
        case 'formula':
            return [`[公式：${block.content.latex}]`];
        case 'table': {
            const lines: string[] = [];
            const { rows, cols, cells } = block.content as {
                rows: number;
                cols: number;
                cells: Array<{ row: number; col: number; content: string }>;
            };
            for (let r = 0; r < rows; r++) {
                const rowCells: string[] = [];
                for (let c = 0; c < cols; c++) {
                    const cell = cells.find(x => x.row === r && x.col === c);
                    rowCells.push(cell?.content ?? '');
                }
                lines.push(rowCells.join('\t'));
            }
            return lines;
        }
        default:
            return [];
    }
}

/**
 * 把 .km 文件原始 JSON 字符串转换为多行纯文本
 *
 * @param raw .km 文件原始内容（JSON 字符串）
 * @returns 多行纯文本（行间用 \n 连接）
 * @throws Error 当 JSON 解析失败时
 */
export function kmFileToPlainText(raw: string): string {
    if (!raw || raw.trim() === '') return '';
    const { blocks } = deserializeFromKmFile(raw);
    const lines: string[] = [];
    for (const block of blocks as AnyBlock[]) {
        lines.push(...blockToLines(block));
    }
    return lines.join('\n');
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `cd D:/projects/my-km && pnpm -F web test -- km-text`
Expected: PASS（5 个测试全部通过）

- [ ] **Step 5: 提交**

```bash
git add apps/web/src/features/ai/tools/km-text.ts apps/web/src/features/ai/tools/__tests__/km-text.test.ts
git commit -m "feat(ai-tools): add kmFileToPlainText utility for raw .km file parsing"
```

---

## Phase 3：EditorService 扩展

### Task 5: 为 EditorService 添加 `spliceText` 方法

**Files:**
- Modify: `apps/web/src/features/editor/service/EditorService.ts`
- Modify: `apps/web/src/features/editor/service/__tests__/EditorService.test.ts`

- [ ] **Step 1: 在 EditorService 接口中添加 spliceText 方法签名**

打开 `apps/web/src/features/editor/service/EditorService.ts`，找到 `EditorService` 接口（约 45-75 行），在 `replaceSelection(text: string): void;` 之后添加：

```typescript
    /**
     * 对整个文档内容执行 splice 操作
     *
     * 类似 JavaScript 的 String.splice：从字符位置 start 开始删除 deleteCount 个字符，
     * 然后在该位置插入 insert 字符串。
     *
     * 实现方式：从 Lexical 获取当前全文 → 按字符串执行 splice → 重新加载到编辑器。
     * 注意：此操作会清除当前选区和富文本格式，仅保留段落分行（按 \n 拆分）。
     *
     * @param start 起始字符位置（从 0 开始，基于纯文本视图）
     * @param deleteCount 要删除的字符数
     * @param insert 要插入的文本（可选）
     * @returns 操作结果
     */
    spliceText(start: number, deleteCount: number, insert?: string): {
        success: boolean;
        error?: string;
        charsDeleted: number;
        charsInserted: number;
    };
```

- [ ] **Step 2: 编写失败的测试**

打开 `apps/web/src/features/editor/service/__tests__/EditorService.test.ts`，在文件末尾的 `describe('EditorService', () => {` 块内追加以下测试用例（在最后一个 `it` 之后、`});` 之前）：

```typescript
    describe('spliceText', () => {
        it('未挂载 editor 时应返回错误', () => {
            const service = createEditorService('doc-1', '/x.km');
            const result = service.spliceText(0, 0, 'hello');
            expect(result.success).toBe(false);
            expect(result.error).toMatch(/editor not initialized/i);
        });
    });
```

- [ ] **Step 3: 运行测试确认失败**

Run: `cd D:/projects/my-km && pnpm -F web test -- EditorService`
Expected: FAIL（`spliceText` 不存在）

- [ ] **Step 4: 实现 spliceText 方法**

在 `apps/web/src/features/editor/service/EditorService.ts` 的 `EditorServiceImpl` 类中，找到 `getFullContent()` 方法（约 397-405 行），在其后添加：

```typescript
    spliceText(
        start: number,
        deleteCount: number,
        insert?: string,
    ): { success: boolean; error?: string; charsDeleted: number; charsInserted: number } {
        if (!this.editor) {
            return {
                success: false,
                error: 'Editor not initialized',
                charsDeleted: 0,
                charsInserted: 0,
            };
        }

        const fullText = this.getFullContent();

        if (start < 0 || start > fullText.length) {
            return {
                success: false,
                error: `Start position ${start} out of bounds (content length: ${fullText.length})`,
                charsDeleted: 0,
                charsInserted: 0,
            };
        }

        const actualDeleteCount = Math.max(0, Math.min(deleteCount, fullText.length - start));
        const insertText = insert ?? '';
        const before = fullText.slice(0, start);
        const after = fullText.slice(start + actualDeleteCount);
        const newText = before + insertText + after;

        // 用 newText 重建编辑器内容：按 \n 拆分为段落
        // 注意：此操作会丢失原有富文本格式（粗体、链接等），
        // 这是 splice_text 工具的已知限制 — 它以纯文本视图为输入/输出
        this.editor.update(() => {
            const root = $getRoot();
            root.clear();
            const lines = newText.length === 0 ? [''] : newText.split('\n');
            for (const line of lines) {
                const paragraph = $createParagraphNode();
                if (line.length > 0) {
                    paragraph.append($createTextNode(line));
                }
                root.append(paragraph);
            }
        });

        return {
            success: true,
            charsDeleted: actualDeleteCount,
            charsInserted: insertText.length,
        };
    }
```

同时，确保文件顶部的 Lexical 导入包含 `$createParagraphNode`。找到现有的 `from 'lexical'` 导入语句，确保它包含以下符号（如缺失则添加）：

```typescript
import {
    $createParagraphNode,
    $createTextNode,
    $getRoot,
    $getSelection,
    $isElementNode,
    $isRangeSelection,
    type LexicalEditor,
} from 'lexical';
```

- [ ] **Step 5: 运行测试确认通过**

Run: `cd D:/projects/my-km && pnpm -F web test -- EditorService`
Expected: PASS（包括新增的 spliceText 测试）

- [ ] **Step 6: 提交**

```bash
git add apps/web/src/features/editor/service/EditorService.ts apps/web/src/features/editor/service/__tests__/EditorService.test.ts
git commit -m "feat(editor): add EditorService.spliceText() for AI splice_text tool

- splice over the editor's plain text view: rebuilds paragraphs from result
- known limitation: loses rich formatting (intended for AI tool use case)"
```

---

## Phase 4：工具 Handler 实现

### Task 6: GetDocumentContentHandler

**Files:**
- Create: `apps/web/src/features/ai/tools/handlers/get-document-content.ts`
- Test: `apps/web/src/features/ai/tools/__tests__/handlers/get-document-content.test.ts`

- [ ] **Step 1: 编写失败的测试**

创建 `apps/web/src/features/ai/tools/__tests__/handlers/get-document-content.test.ts`：

```typescript
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GetDocumentContentHandler } from '../../handlers/get-document-content';

describe('GetDocumentContentHandler', () => {
    let documentStore: {
        get: ReturnType<typeof vi.fn>;
    };
    let editorContainer: {
        getService: ReturnType<typeof vi.fn>;
    };
    let fileSystemService: {
        readFile: ReturnType<typeof vi.fn>;
    };
    let handler: GetDocumentContentHandler;

    beforeEach(() => {
        documentStore = { get: vi.fn() };
        editorContainer = { getService: vi.fn() };
        fileSystemService = { readFile: vi.fn() };
        handler = new GetDocumentContentHandler(
            documentStore as never,
            editorContainer as never,
            fileSystemService as never,
        );
    });

    it('name 应为 get_document_content', () => {
        expect(handler.name).toBe('get_document_content');
    });

    it('type 应为 read', () => {
        expect(handler.type).toBe('read');
    });

    it('文档不存在时应返回错误', async () => {
        documentStore.get.mockReturnValue(undefined);

        const result = await handler.execute({ documentId: 'unknown' });

        expect(result.success).toBe(false);
        expect(result.error).toMatch(/Document not found: unknown/);
    });

    it('已打开文档应使用 EditorService.getFullContent', async () => {
        documentStore.get.mockReturnValue({
            id: 'doc-1',
            path: '/notes/a.km',
            title: 'A',
            type: 'km',
        });
        editorContainer.getService.mockReturnValue({
            getFullContent: () => 'line one\nline two\nline three',
        });

        const result = await handler.execute({ documentId: 'doc-1' });

        expect(result.success).toBe(true);
        expect(result.content).toBe('line one\nline two\nline three');
        expect(result.totalLines).toBe(3);
        expect(result.title).toBe('A');
        expect(fileSystemService.readFile).not.toHaveBeenCalled();
    });

    it('未打开文档应从文件系统读取并解析 .km', async () => {
        documentStore.get.mockReturnValue({
            id: 'doc-2',
            path: '/notes/b.km',
            title: 'B',
            type: 'km',
        });
        editorContainer.getService.mockReturnValue(null);
        fileSystemService.readFile.mockResolvedValue(
            JSON.stringify({
                metadata: { version: '1.0.0', createdAt: '', updatedAt: '' },
                content: [
                    { type: 'paragraph', content: { inline: [{ text: 'hello' }] } },
                ],
            }),
        );

        const result = await handler.execute({ documentId: 'doc-2' });

        expect(result.success).toBe(true);
        expect(result.content).toBe('hello');
        expect(result.totalLines).toBe(1);
    });

    it('startLine 和 endLine 应正确切片', async () => {
        documentStore.get.mockReturnValue({
            id: 'doc-1',
            path: '/x.km',
            title: 'X',
            type: 'km',
        });
        editorContainer.getService.mockReturnValue({
            getFullContent: () => 'a\nb\nc\nd\ne',
        });

        const result = await handler.execute({
            documentId: 'doc-1',
            startLine: 2,
            endLine: 4,
        });

        expect(result.success).toBe(true);
        expect(result.content).toBe('b\nc\nd');
        expect(result.startLine).toBe(2);
        expect(result.endLine).toBe(4);
    });

    it('startLine 越界应返回错误', async () => {
        documentStore.get.mockReturnValue({
            id: 'doc-1',
            path: '/x.km',
            title: 'X',
            type: 'km',
        });
        editorContainer.getService.mockReturnValue({
            getFullContent: () => 'a\nb',
        });

        const result = await handler.execute({ documentId: 'doc-1', startLine: 10 });

        expect(result.success).toBe(false);
        expect(result.error).toMatch(/out of bounds/i);
    });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd D:/projects/my-km && pnpm -F web test -- get-document-content`
Expected: FAIL（模块未找到）

- [ ] **Step 3: 实现 handler**

创建 `apps/web/src/features/ai/tools/handlers/get-document-content.ts`：

```typescript
import type { EditorContainer } from '@/platform/editor/container/editor-container';
import type { DocumentStore } from '@/platform/document-store/service';
import type { FileSystemService } from '@/platform/file-system/service';
import { kmFileToPlainText } from '../km-text';
import type { FrontendToolHandler, ToolResult } from '../types';

/**
 * get_document_content — 获取文档内容（支持行号切片）
 *
 * 优先从 EditorContainer 中已打开文档的 EditorService 读取，
 * 未打开时回退到 FileSystemService.readFile + 解析 .km。
 */
export class GetDocumentContentHandler implements FrontendToolHandler {
    readonly name = 'get_document_content';
    readonly type = 'read';

    constructor(
        private readonly documentStore: DocumentStore,
        private readonly editorContainer: EditorContainer,
        private readonly fileSystemService: FileSystemService,
    ) {}

    describe(args: Record<string, unknown>): string {
        return `读取文档 ${String(args.documentId ?? '')}`;
    }

    async execute(args: Record<string, unknown>): Promise<ToolResult> {
        const documentId = String(args.documentId ?? '');
        if (!documentId) {
            return { success: false, error: 'documentId is required' };
        }

        const meta = this.documentStore.get(documentId);
        if (!meta) {
            return { success: false, error: `Document not found: ${documentId}` };
        }

        let fullText: string;
        try {
            const editor = this.editorContainer.getService(documentId);
            if (editor) {
                fullText = editor.getFullContent();
            } else {
                const raw = await this.fileSystemService.readFile(meta.path);
                const rawString = typeof raw === 'string' ? raw : new TextDecoder().decode(raw);
                fullText = kmFileToPlainText(rawString);
            }
        } catch (err) {
            return {
                success: false,
                error: `Failed to read document: ${(err as Error).message}`,
            };
        }

        const lines = fullText.split('\n');
        const totalLines = lines.length;

        const startLine = typeof args.startLine === 'number' ? args.startLine : undefined;
        const endLine = typeof args.endLine === 'number' ? args.endLine : undefined;

        if (startLine !== undefined && (startLine < 1 || startLine > totalLines)) {
            return {
                success: false,
                error: `Line range out of bounds: startLine=${startLine}, totalLines=${totalLines}`,
            };
        }

        const effectiveStart = startLine ?? 1;
        const effectiveEnd = endLine ?? totalLines;
        const sliced = lines.slice(effectiveStart - 1, effectiveEnd);

        return {
            success: true,
            content: sliced.join('\n'),
            totalLines,
            startLine: effectiveStart,
            endLine: Math.min(effectiveEnd, totalLines),
            documentId,
            title: meta.title,
        };
    }
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `cd D:/projects/my-km && pnpm -F web test -- get-document-content`
Expected: PASS（6 个测试全部通过）

- [ ] **Step 5: 提交**

```bash
git add apps/web/src/features/ai/tools/handlers/get-document-content.ts apps/web/src/features/ai/tools/__tests__/handlers/get-document-content.test.ts
git commit -m "feat(ai-tools): implement GetDocumentContentHandler

- Reads from EditorService if document is open, falls back to .km file
- Supports startLine/endLine slicing with bounds validation"
```

---

### Task 7: GetChildItemsHandler

**Files:**
- Create: `apps/web/src/features/ai/tools/handlers/get-child-items.ts`
- Test: `apps/web/src/features/ai/tools/__tests__/handlers/get-child-items.test.ts`

- [ ] **Step 1: 编写失败的测试**

创建 `apps/web/src/features/ai/tools/__tests__/handlers/get-child-items.test.ts`：

```typescript
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GetChildItemsHandler } from '../../handlers/get-child-items';

describe('GetChildItemsHandler', () => {
    let fileSystemService: { listFiles: ReturnType<typeof vi.fn> };
    let getProjectRoot: ReturnType<typeof vi.fn>;
    let handler: GetChildItemsHandler;

    beforeEach(() => {
        fileSystemService = { listFiles: vi.fn() };
        getProjectRoot = vi.fn().mockReturnValue('memory://project');
        handler = new GetChildItemsHandler(fileSystemService as never, getProjectRoot);
    });

    it('name 应为 get_child_items', () => {
        expect(handler.name).toBe('get_child_items');
    });

    it('type 应为 read', () => {
        expect(handler.type).toBe('read');
    });

    it('未提供 root 时应使用项目根目录', async () => {
        fileSystemService.listFiles.mockResolvedValue([]);

        await handler.execute({});

        expect(getProjectRoot).toHaveBeenCalled();
        expect(fileSystemService.listFiles).toHaveBeenCalledWith('memory://project');
    });

    it('depth=1 应只列出一级子项', async () => {
        fileSystemService.listFiles.mockResolvedValueOnce([
            { type: 'file', name: 'a.km', path: 'memory://project/a.km' },
            { type: 'directory', name: 'sub', path: 'memory://project/sub' },
        ]);

        const result = await handler.execute({ depth: 1 });

        expect(result.success).toBe(true);
        expect(result.items).toEqual([
            { name: 'a.km', type: 'file', path: 'memory://project/a.km' },
            { name: 'sub', type: 'directory', path: 'memory://project/sub' },
        ]);
        // depth=1 不递归进 sub
        expect(fileSystemService.listFiles).toHaveBeenCalledTimes(1);
    });

    it('depth=2 应递归一级子目录', async () => {
        fileSystemService.listFiles
            .mockResolvedValueOnce([
                { type: 'directory', name: 'sub', path: 'memory://project/sub' },
            ])
            .mockResolvedValueOnce([
                { type: 'file', name: 'inner.km', path: 'memory://project/sub/inner.km' },
            ]);

        const result = await handler.execute({ depth: 2 });

        expect(result.success).toBe(true);
        expect(result.items).toEqual([
            {
                name: 'sub',
                type: 'directory',
                path: 'memory://project/sub',
                children: [
                    {
                        name: 'inner.km',
                        type: 'file',
                        path: 'memory://project/sub/inner.km',
                    },
                ],
            },
        ]);
    });

    it('listFiles 抛出错误时应返回错误结果', async () => {
        fileSystemService.listFiles.mockRejectedValue(new Error('not found'));

        const result = await handler.execute({ root: 'memory://nowhere' });

        expect(result.success).toBe(false);
        expect(result.error).toMatch(/not found/);
    });

    it('无项目根目录且未提供 root 时应返回错误', async () => {
        getProjectRoot.mockReturnValue(null);

        const result = await handler.execute({});

        expect(result.success).toBe(false);
        expect(result.error).toMatch(/no project root/i);
    });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd D:/projects/my-km && pnpm -F web test -- get-child-items`
Expected: FAIL

- [ ] **Step 3: 实现 handler**

创建 `apps/web/src/features/ai/tools/handlers/get-child-items.ts`：

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
 * get_child_items — 获取目录下递归 depth 层的子文件/目录
 *
 * getProjectRoot 是一个回调，避免直接依赖 workspace store（便于测试）。
 * 默认从 workspace store 获取当前打开项目的根目录路径。
 */
export class GetChildItemsHandler implements FrontendToolHandler {
    readonly name = 'get_child_items';
    readonly type = 'read';

    constructor(
        private readonly fileSystemService: FileSystemService,
        private readonly getProjectRoot: () => string | null,
    ) {}

    describe(args: Record<string, unknown>): string {
        const root = String(args.root ?? '<project root>');
        const depth = typeof args.depth === 'number' ? args.depth : 1;
        return `列出 ${root} 下 ${depth} 层的子项`;
    }

    async execute(args: Record<string, unknown>): Promise<ToolResult> {
        let root: string | null = typeof args.root === 'string' ? args.root : null;
        if (!root) {
            root = this.getProjectRoot();
            if (!root) {
                return {
                    success: false,
                    error: 'No project root available; please provide root explicitly',
                };
            }
        }
        const depth = typeof args.depth === 'number' && args.depth > 0 ? args.depth : 1;

        try {
            const items = await this.walk(root, depth);
            return { success: true, root, items };
        } catch (err) {
            return {
                success: false,
                error: `Failed to list child items: ${(err as Error).message}`,
            };
        }
    }

    private async walk(dir: string, remainingDepth: number): Promise<TreeItem[]> {
        const stats = await this.fileSystemService.listFiles(dir);
        const items: TreeItem[] = [];
        for (const stat of stats) {
            const item: TreeItem = {
                name: stat.name,
                type: stat.type,
                path: stat.path,
            };
            if (stat.type === 'directory' && remainingDepth > 1) {
                item.children = await this.walk(stat.path, remainingDepth - 1);
            }
            items.push(item);
        }
        return items;
    }
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `cd D:/projects/my-km && pnpm -F web test -- get-child-items`
Expected: PASS（6 个测试全部通过）

- [ ] **Step 5: 提交**

```bash
git add apps/web/src/features/ai/tools/handlers/get-child-items.ts apps/web/src/features/ai/tools/__tests__/handlers/get-child-items.test.ts
git commit -m "feat(ai-tools): implement GetChildItemsHandler

- Walks FileSystemService.listFiles up to depth levels
- Defaults root to current project root via callback"
```

---

### Task 8: InsertTextHandler

**Files:**
- Create: `apps/web/src/features/ai/tools/handlers/insert-text.ts`
- Test: `apps/web/src/features/ai/tools/__tests__/handlers/insert-text.test.ts`

- [ ] **Step 1: 编写失败的测试**

创建 `apps/web/src/features/ai/tools/__tests__/handlers/insert-text.test.ts`：

```typescript
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InsertTextHandler } from '../../handlers/insert-text';

describe('InsertTextHandler', () => {
    let documentStore: { get: ReturnType<typeof vi.fn> };
    let editorContainer: { getService: ReturnType<typeof vi.fn> };
    let fileSystemService: {
        readFile: ReturnType<typeof vi.fn>;
        writeFile: ReturnType<typeof vi.fn>;
    };
    let handler: InsertTextHandler;

    beforeEach(() => {
        documentStore = { get: vi.fn() };
        editorContainer = { getService: vi.fn() };
        fileSystemService = { readFile: vi.fn(), writeFile: vi.fn() };
        handler = new InsertTextHandler(
            documentStore as never,
            editorContainer as never,
            fileSystemService as never,
        );
    });

    it('name 应为 insert_text', () => {
        expect(handler.name).toBe('insert_text');
    });

    it('type 应为 write', () => {
        expect(handler.type).toBe('write');
    });

    it('缺少 text 应返回错误', async () => {
        const result = await handler.execute({ documentId: 'doc-1' });
        expect(result.success).toBe(false);
        expect(result.error).toMatch(/text is required/);
    });

    it('缺少 documentId 应返回错误', async () => {
        const result = await handler.execute({ text: 'hi' });
        expect(result.success).toBe(false);
        expect(result.error).toMatch(/documentId is required/);
    });

    it('文档不存在应返回错误', async () => {
        documentStore.get.mockReturnValue(undefined);
        const result = await handler.execute({ text: 'hi', documentId: 'x' });
        expect(result.success).toBe(false);
        expect(result.error).toMatch(/Document not found: x/);
    });

    it('已打开文档 position=cursor 应调用 insertTextAtCursor', async () => {
        documentStore.get.mockReturnValue({
            id: 'doc-1',
            path: '/a.km',
            title: 'A',
            type: 'km',
        });
        const insertSpy = vi.fn();
        editorContainer.getService.mockReturnValue({
            insertTextAtCursor: insertSpy,
            spliceText: vi.fn(),
            getFullContent: () => '',
        });

        const result = await handler.execute({
            text: 'hello',
            documentId: 'doc-1',
            position: 'cursor',
        });

        expect(result.success).toBe(true);
        expect(insertSpy).toHaveBeenCalledWith('hello');
    });

    it('已打开文档 position=end 应通过 spliceText 追加到末尾', async () => {
        documentStore.get.mockReturnValue({
            id: 'doc-1',
            path: '/a.km',
            title: 'A',
            type: 'km',
        });
        const spliceSpy = vi.fn().mockReturnValue({
            success: true,
            charsDeleted: 0,
            charsInserted: 5,
        });
        editorContainer.getService.mockReturnValue({
            insertTextAtCursor: vi.fn(),
            spliceText: spliceSpy,
            getFullContent: () => 'abc',
        });

        const result = await handler.execute({
            text: 'hello',
            documentId: 'doc-1',
            position: 'end',
        });

        expect(result.success).toBe(true);
        // 末尾位置 = 'abc'.length = 3, deleteCount=0, insert='hello'
        expect(spliceSpy).toHaveBeenCalledWith(3, 0, 'hello');
    });

    it('未打开文档应通过 fileSystemService 读写', async () => {
        documentStore.get.mockReturnValue({
            id: 'doc-2',
            path: '/b.km',
            title: 'B',
            type: 'km',
        });
        editorContainer.getService.mockReturnValue(null);
        fileSystemService.readFile.mockResolvedValue(
            JSON.stringify({
                metadata: {
                    version: '1.0.0',
                    createdAt: 'x',
                    updatedAt: 'y',
                    title: 'B',
                },
                content: [
                    { type: 'paragraph', content: { inline: [{ text: 'old' }] } },
                ],
            }),
        );

        const result = await handler.execute({
            text: 'new',
            documentId: 'doc-2',
            position: 'end',
        });

        expect(result.success).toBe(true);
        expect(fileSystemService.writeFile).toHaveBeenCalledTimes(1);
        const [path, content] = fileSystemService.writeFile.mock.calls[0];
        expect(path).toBe('/b.km');
        const parsed = JSON.parse(content);
        const text = parsed.content[parsed.content.length - 1].content.inline[0].text;
        expect(text).toBe('new');
    });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd D:/projects/my-km && pnpm -F web test -- insert-text`
Expected: FAIL

- [ ] **Step 3: 实现 handler**

创建 `apps/web/src/features/ai/tools/handlers/insert-text.ts`：

```typescript
import { deserializeFromKmFile, serializeToKmFile } from '@/features/editor/converter/km-serializer';
import type { DocumentStore } from '@/platform/document-store/service';
import type { EditorContainer } from '@/platform/editor/container/editor-container';
import type { FileSystemService } from '@/platform/file-system/service';
import type { FrontendToolHandler, ToolResult } from '../types';

/**
 * insert_text — 在文档末尾或光标位置插入文本
 *
 * - position=cursor：仅对已打开文档有效，调用 EditorService.insertTextAtCursor
 * - position=end（默认）：
 *   - 已打开文档：通过 EditorService.spliceText 在 getFullContent().length 位置插入
 *   - 未打开文档：读取 .km → 追加一个段落 block → 写回
 */
export class InsertTextHandler implements FrontendToolHandler {
    readonly name = 'insert_text';
    readonly type = 'write';

    constructor(
        private readonly documentStore: DocumentStore,
        private readonly editorContainer: EditorContainer,
        private readonly fileSystemService: FileSystemService,
    ) {}

    describe(args: Record<string, unknown>): string {
        const docId = String(args.documentId ?? '');
        const position = String(args.position ?? 'end');
        const preview = String(args.text ?? '').slice(0, 40);
        return `在文档 ${docId} 的${position === 'cursor' ? '光标位置' : '末尾'}插入文本：${preview}${preview.length >= 40 ? '...' : ''}`;
    }

    async execute(args: Record<string, unknown>): Promise<ToolResult> {
        const text = typeof args.text === 'string' ? args.text : undefined;
        const documentId = typeof args.documentId === 'string' ? args.documentId : undefined;
        const position = (args.position === 'cursor' ? 'cursor' : 'end') as 'cursor' | 'end';

        if (text === undefined) return { success: false, error: 'text is required' };
        if (!documentId) return { success: false, error: 'documentId is required' };

        const meta = this.documentStore.get(documentId);
        if (!meta) return { success: false, error: `Document not found: ${documentId}` };

        const editor = this.editorContainer.getService(documentId);

        try {
            if (editor) {
                if (position === 'cursor') {
                    editor.insertTextAtCursor(text);
                } else {
                    const fullText = editor.getFullContent();
                    const result = editor.spliceText(fullText.length, 0, text);
                    if (!result.success) {
                        return { success: false, error: result.error };
                    }
                }
                return { success: true, documentId };
            }

            // 未打开文档：从文件读取 → 追加段落 → 写回
            const raw = await this.fileSystemService.readFile(meta.path);
            const rawString = typeof raw === 'string' ? raw : new TextDecoder().decode(raw);
            const { blocks, metadata } = deserializeFromKmFile(rawString);
            blocks.push({
                type: 'paragraph',
                // biome-ignore lint/suspicious/noExplicitAny: Block.content is a discriminated union; paragraph requires inline
                content: { inline: [{ text }] } as any,
            });
            const newContent = serializeToKmFile(blocks, {
                title: metadata.title,
                createdAt: metadata.createdAt,
                updatedAt: new Date().toISOString(),
                custom: metadata.custom,
            });
            await this.fileSystemService.writeFile(meta.path, newContent);
            return { success: true, documentId };
        } catch (err) {
            return {
                success: false,
                error: `Failed to insert text: ${(err as Error).message}`,
            };
        }
    }
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `cd D:/projects/my-km && pnpm -F web test -- insert-text`
Expected: PASS（7 个测试全部通过）

- [ ] **Step 5: 提交**

```bash
git add apps/web/src/features/ai/tools/handlers/insert-text.ts apps/web/src/features/ai/tools/__tests__/handlers/insert-text.test.ts
git commit -m "feat(ai-tools): implement InsertTextHandler

- position=cursor uses EditorService.insertTextAtCursor (open documents only)
- position=end uses EditorService.spliceText for open docs, appends paragraph for closed"
```

---

### Task 9: SpliceTextHandler

**Files:**
- Create: `apps/web/src/features/ai/tools/handlers/splice-text.ts`
- Test: `apps/web/src/features/ai/tools/__tests__/handlers/splice-text.test.ts`

- [ ] **Step 1: 编写失败的测试**

创建 `apps/web/src/features/ai/tools/__tests__/handlers/splice-text.test.ts`：

```typescript
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SpliceTextHandler } from '../../handlers/splice-text';

describe('SpliceTextHandler', () => {
    let documentStore: { get: ReturnType<typeof vi.fn> };
    let editorContainer: { getService: ReturnType<typeof vi.fn> };
    let fileSystemService: {
        readFile: ReturnType<typeof vi.fn>;
        writeFile: ReturnType<typeof vi.fn>;
    };
    let handler: SpliceTextHandler;

    beforeEach(() => {
        documentStore = { get: vi.fn() };
        editorContainer = { getService: vi.fn() };
        fileSystemService = { readFile: vi.fn(), writeFile: vi.fn() };
        handler = new SpliceTextHandler(
            documentStore as never,
            editorContainer as never,
            fileSystemService as never,
        );
    });

    it('name 应为 splice_text', () => {
        expect(handler.name).toBe('splice_text');
    });

    it('type 应为 write', () => {
        expect(handler.type).toBe('write');
    });

    it('缺少 documentId 应返回错误', async () => {
        const result = await handler.execute({ start: 0, deleteCount: 0 });
        expect(result.success).toBe(false);
        expect(result.error).toMatch(/documentId is required/);
    });

    it('文档不存在应返回错误', async () => {
        documentStore.get.mockReturnValue(undefined);
        const result = await handler.execute({
            documentId: 'x',
            start: 0,
            deleteCount: 0,
        });
        expect(result.success).toBe(false);
        expect(result.error).toMatch(/Document not found/);
    });

    it('已打开文档应通过 EditorService.spliceText', async () => {
        documentStore.get.mockReturnValue({
            id: 'doc-1',
            path: '/a.km',
            title: 'A',
            type: 'km',
        });
        const spliceSpy = vi.fn().mockReturnValue({
            success: true,
            charsDeleted: 5,
            charsInserted: 11,
        });
        editorContainer.getService.mockReturnValue({ spliceText: spliceSpy });

        const result = await handler.execute({
            documentId: 'doc-1',
            start: 3,
            deleteCount: 5,
            insert: 'hello world',
        });

        expect(result.success).toBe(true);
        expect(result.charsDeleted).toBe(5);
        expect(result.charsInserted).toBe(11);
        expect(spliceSpy).toHaveBeenCalledWith(3, 5, 'hello world');
    });

    it('已打开文档 EditorService 返回失败时应透传错误', async () => {
        documentStore.get.mockReturnValue({
            id: 'doc-1',
            path: '/a.km',
            title: 'A',
            type: 'km',
        });
        editorContainer.getService.mockReturnValue({
            spliceText: () => ({
                success: false,
                error: 'Start position 999 out of bounds (content length: 10)',
                charsDeleted: 0,
                charsInserted: 0,
            }),
        });

        const result = await handler.execute({
            documentId: 'doc-1',
            start: 999,
            deleteCount: 0,
        });

        expect(result.success).toBe(false);
        expect(result.error).toMatch(/out of bounds/);
    });

    it('未打开文档应读取 .km、执行 splice 并写回', async () => {
        documentStore.get.mockReturnValue({
            id: 'doc-2',
            path: '/b.km',
            title: 'B',
            type: 'km',
        });
        editorContainer.getService.mockReturnValue(null);
        fileSystemService.readFile.mockResolvedValue(
            JSON.stringify({
                metadata: {
                    version: '1.0.0',
                    createdAt: 'x',
                    updatedAt: 'y',
                    title: 'B',
                },
                content: [
                    { type: 'paragraph', content: { inline: [{ text: 'helloworld' }] } },
                ],
            }),
        );

        // 'helloworld' → splice(5, 5, ' there') → 'hello there'
        const result = await handler.execute({
            documentId: 'doc-2',
            start: 5,
            deleteCount: 5,
            insert: ' there',
        });

        expect(result.success).toBe(true);
        expect(result.charsDeleted).toBe(5);
        expect(result.charsInserted).toBe(6);
        const [, content] = fileSystemService.writeFile.mock.calls[0];
        const parsed = JSON.parse(content);
        const text = parsed.content[0].content.inline[0].text;
        expect(text).toBe('hello there');
    });

    it('未打开文档 start 越界应返回错误', async () => {
        documentStore.get.mockReturnValue({
            id: 'doc-3',
            path: '/c.km',
            title: 'C',
            type: 'km',
        });
        editorContainer.getService.mockReturnValue(null);
        fileSystemService.readFile.mockResolvedValue(
            JSON.stringify({
                metadata: { version: '1.0.0', createdAt: '', updatedAt: '' },
                content: [
                    { type: 'paragraph', content: { inline: [{ text: 'short' }] } },
                ],
            }),
        );

        const result = await handler.execute({
            documentId: 'doc-3',
            start: 100,
            deleteCount: 0,
        });

        expect(result.success).toBe(false);
        expect(result.error).toMatch(/out of bounds/);
    });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd D:/projects/my-km && pnpm -F web test -- splice-text`
Expected: FAIL

- [ ] **Step 3: 实现 handler**

创建 `apps/web/src/features/ai/tools/handlers/splice-text.ts`：

```typescript
import { deserializeFromKmFile, serializeToKmFile } from '@/features/editor/converter/km-serializer';
import type { DocumentStore } from '@/platform/document-store/service';
import type { EditorContainer } from '@/platform/editor/container/editor-container';
import type { FileSystemService } from '@/platform/file-system/service';
import { kmFileToPlainText } from '../km-text';
import type { FrontendToolHandler, ToolResult } from '../types';

/**
 * splice_text — 对文档执行 splice 操作（类似 JavaScript String.splice）
 *
 * - 已打开文档：委托给 EditorService.spliceText
 * - 未打开文档：读 .km → 提取纯文本 → 执行 splice → 写回（单段落 block）
 */
export class SpliceTextHandler implements FrontendToolHandler {
    readonly name = 'splice_text';
    readonly type = 'write';

    constructor(
        private readonly documentStore: DocumentStore,
        private readonly editorContainer: EditorContainer,
        private readonly fileSystemService: FileSystemService,
    ) {}

    describe(args: Record<string, unknown>): string {
        const docId = String(args.documentId ?? '');
        const start = Number(args.start ?? 0);
        const deleteCount = Number(args.deleteCount ?? 0);
        const insert = typeof args.insert === 'string' ? args.insert : '';
        const insertPreview = insert.slice(0, 30);
        return `在文档 ${docId} 位置 ${start} 删除 ${deleteCount} 字符并插入 "${insertPreview}${insertPreview.length >= 30 ? '...' : ''}"`;
    }

    async execute(args: Record<string, unknown>): Promise<ToolResult> {
        const documentId = typeof args.documentId === 'string' ? args.documentId : undefined;
        const start = typeof args.start === 'number' ? args.start : undefined;
        const deleteCount = typeof args.deleteCount === 'number' ? args.deleteCount : undefined;
        const insert = typeof args.insert === 'string' ? args.insert : undefined;

        if (!documentId) return { success: false, error: 'documentId is required' };
        if (start === undefined) return { success: false, error: 'start is required' };
        if (deleteCount === undefined) return { success: false, error: 'deleteCount is required' };

        const meta = this.documentStore.get(documentId);
        if (!meta) return { success: false, error: `Document not found: ${documentId}` };

        const editor = this.editorContainer.getService(documentId);

        try {
            if (editor) {
                const result = editor.spliceText(start, deleteCount, insert);
                if (!result.success) {
                    return { success: false, error: result.error };
                }
                return {
                    success: true,
                    documentId,
                    charsDeleted: result.charsDeleted,
                    charsInserted: result.charsInserted,
                };
            }

            // 未打开文档：读 .km → splice → 写回
            const raw = await this.fileSystemService.readFile(meta.path);
            const rawString = typeof raw === 'string' ? raw : new TextDecoder().decode(raw);
            const { metadata } = deserializeFromKmFile(rawString);
            const fullText = kmFileToPlainText(rawString);

            if (start < 0 || start > fullText.length) {
                return {
                    success: false,
                    error: `Start position ${start} out of bounds (content length: ${fullText.length})`,
                };
            }

            const actualDeleteCount = Math.max(0, Math.min(deleteCount, fullText.length - start));
            const insertText = insert ?? '';
            const newText = fullText.slice(0, start) + insertText + fullText.slice(start + actualDeleteCount);

            // 把 newText 按 \n 拆分为段落 blocks 写回
            const lines = newText.length === 0 ? [''] : newText.split('\n');
            const newBlocks = lines.map(line => ({
                type: 'paragraph' as const,
                // biome-ignore lint/suspicious/noExplicitAny: Block.content union, paragraph requires inline
                content: { inline: line ? [{ text: line }] : [] } as any,
            }));
            const newContent = serializeToKmFile(newBlocks as never, {
                title: metadata.title,
                createdAt: metadata.createdAt,
                updatedAt: new Date().toISOString(),
                custom: metadata.custom,
            });
            await this.fileSystemService.writeFile(meta.path, newContent);

            return {
                success: true,
                documentId,
                charsDeleted: actualDeleteCount,
                charsInserted: insertText.length,
            };
        } catch (err) {
            return {
                success: false,
                error: `Failed to splice text: ${(err as Error).message}`,
            };
        }
    }
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `cd D:/projects/my-km && pnpm -F web test -- splice-text`
Expected: PASS（7 个测试全部通过）

- [ ] **Step 5: 提交**

```bash
git add apps/web/src/features/ai/tools/handlers/splice-text.ts apps/web/src/features/ai/tools/__tests__/handlers/splice-text.test.ts
git commit -m "feat(ai-tools): implement SpliceTextHandler

- Delegates to EditorService.spliceText for open documents
- Reads/parses/rewrites .km for closed documents"
```

---

## Phase 5：FrontendToolExecutor 调度器

### Task 10: 实现 FrontendToolExecutor

**Files:**
- Create: `apps/web/src/features/ai/tools/frontend-tool-executor.ts`
- Test: `apps/web/src/features/ai/tools/__tests__/frontend-tool-executor.test.ts`

- [ ] **Step 1: 编写失败的测试**

创建 `apps/web/src/features/ai/tools/__tests__/frontend-tool-executor.test.ts`：

```typescript
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FrontendToolExecutor } from '../frontend-tool-executor';
import type { FrontendToolHandler, ToolResult } from '../types';

function makeHandler(
    name: string,
    type: 'read' | 'write',
    result: ToolResult = { success: true },
): FrontendToolHandler {
    return {
        name,
        type,
        execute: vi.fn().mockResolvedValue(result),
        describe: () => `desc:${name}`,
    };
}

describe('FrontendToolExecutor', () => {
    let executor: FrontendToolExecutor;

    beforeEach(() => {
        executor = new FrontendToolExecutor();
    });

    it('未知工具应返回 success=false', async () => {
        const result = await executor.dispatch('unknown', {});
        expect(result.success).toBe(false);
        expect(result.error).toMatch(/Unknown tool: unknown/);
    });

    it('读工具应自动执行且不触发 confirmation', async () => {
        const handler = makeHandler('read-tool', 'read', {
            success: true,
            content: 'ok',
        });
        executor.register(handler);
        const confirmListener = vi.fn();
        executor.onConfirmationRequest(confirmListener);

        const result = await executor.dispatch('read-tool', { foo: 1 });

        expect(result).toEqual({ success: true, content: 'ok' });
        expect(handler.execute).toHaveBeenCalledWith({ foo: 1 });
        expect(confirmListener).not.toHaveBeenCalled();
    });

    it('写工具应触发 confirmation，approved=true 时执行', async () => {
        const handler = makeHandler('write-tool', 'write', { success: true });
        executor.register(handler);

        executor.onConfirmationRequest(req => {
            expect(req.toolName).toBe('write-tool');
            expect(req.description).toBe('desc:write-tool');
            req.resolve(true);
        });

        const result = await executor.dispatch('write-tool', { x: 1 });

        expect(result.success).toBe(true);
        expect(handler.execute).toHaveBeenCalledWith({ x: 1 });
    });

    it('写工具被拒绝时不执行 handler 并返回拒绝错误', async () => {
        const handler = makeHandler('write-tool', 'write');
        executor.register(handler);

        executor.onConfirmationRequest(req => req.resolve(false));

        const result = await executor.dispatch('write-tool', {});

        expect(result.success).toBe(false);
        expect(result.error).toMatch(/User rejected/);
        expect(handler.execute).not.toHaveBeenCalled();
    });

    it('handler 抛出异常时应捕获并返回 success=false', async () => {
        const handler: FrontendToolHandler = {
            name: 'crashy',
            type: 'read',
            execute: vi.fn().mockRejectedValue(new Error('boom')),
            describe: () => 'desc',
        };
        executor.register(handler);

        const result = await executor.dispatch('crashy', {});

        expect(result.success).toBe(false);
        expect(result.error).toMatch(/boom/);
    });

    it('同名 handler 重复注册时应覆盖', () => {
        const h1 = makeHandler('same', 'read', { success: true, v: 1 });
        const h2 = makeHandler('same', 'read', { success: true, v: 2 });
        executor.register(h1);
        executor.register(h2);

        expect(executor.dispatch('same', {})).resolves.toEqual({ success: true, v: 2 });
    });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd D:/projects/my-km && pnpm -F web test -- frontend-tool-executor`
Expected: FAIL

- [ ] **Step 3: 实现 FrontendToolExecutor**

创建 `apps/web/src/features/ai/tools/frontend-tool-executor.ts`：

```typescript
import { Emitter, type Event } from '@/base/common/event';
import type { ConfirmationRequest, FrontendToolHandler, ToolResult } from './types';

/**
 * FrontendToolExecutor
 *
 * 负责：
 * 1. 注册前端工具 handler
 * 2. 接收 interrupt 触发的工具调用，按 read/write 分流：
 *    - read：直接执行
 *    - write：触发 onConfirmationRequest 事件，等待 UI resolve 后再执行
 * 3. 把执行结果作为 ToolResult 返回给调用方（再由调用方 resumeWithToolResult）
 *
 * 不直接处理 SSE/interrupt 协议；由消费方（AIPanel）订阅 interrupt 并调用 dispatch。
 */
export class FrontendToolExecutor {
    private readonly handlers = new Map<string, FrontendToolHandler>();
    private readonly _onConfirmationRequest = new Emitter<ConfirmationRequest>();
    readonly onConfirmationRequest: Event<ConfirmationRequest> = this._onConfirmationRequest.event;

    register(handler: FrontendToolHandler): void {
        this.handlers.set(handler.name, handler);
    }

    async dispatch(toolName: string, input: Record<string, unknown>): Promise<ToolResult> {
        const handler = this.handlers.get(toolName);
        if (!handler) {
            return { success: false, error: `Unknown tool: ${toolName}` };
        }

        try {
            if (handler.type === 'read') {
                return await handler.execute(input);
            }

            const approved = await this.requestConfirmation(handler, input);
            if (!approved) {
                return { success: false, error: 'User rejected the operation' };
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

- [ ] **Step 4: 运行测试确认通过**

Run: `cd D:/projects/my-km && pnpm -F web test -- frontend-tool-executor`
Expected: PASS（6 个测试全部通过）

- [ ] **Step 5: 提交**

```bash
git add apps/web/src/features/ai/tools/frontend-tool-executor.ts apps/web/src/features/ai/tools/__tests__/frontend-tool-executor.test.ts
git commit -m "feat(ai-tools): implement FrontendToolExecutor dispatcher

- Auto-executes read tools, requires confirmation for write tools
- Emits onConfirmationRequest event for UI to subscribe
- Catches handler exceptions and returns them as ToolResult"
```

---

## Phase 6：UI 集成

### Task 11: 实现 ToolConfirmationDialog 组件

**Files:**
- Create: `apps/web/src/components/workspace/ai-panel/tool-confirmation-dialog.tsx`

- [ ] **Step 1: 创建确认对话框组件**

创建 `apps/web/src/components/workspace/ai-panel/tool-confirmation-dialog.tsx`：

```tsx
'use client';

import { Button } from '@/components/ui/button';
import type { ConfirmationRequest } from '@/features/ai/tools/types';

interface ToolConfirmationDialogProps {
    request: ConfirmationRequest | null;
    onResolve: (approved: boolean) => void;
}

/**
 * ToolConfirmationDialog
 *
 * 内联展示在 AIPanel 消息流中，提示用户确认 AI 发起的写操作工具调用。
 * 用户点击 Confirm/Reject 后通过 onResolve 回调通知调度器。
 */
export function ToolConfirmationDialog({ request, onResolve }: ToolConfirmationDialogProps) {
    if (!request) return null;

    return (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3">
            <div className="mb-2 flex items-center gap-2">
                <div className="h-2 w-2 animate-pulse rounded-full bg-amber-500" />
                <span className="font-mono text-amber-400 text-xs">{request.toolName}</span>
            </div>
            <p className="mb-2 text-[12px] text-ws-fg-secondary">{request.description}</p>
            <pre className="mb-2 overflow-auto rounded bg-black/20 p-2 text-[11px] text-ws-fg-secondary">
                {JSON.stringify(request.input, null, 2)}
            </pre>
            <div className="flex gap-2">
                <Button
                    size="sm"
                    onClick={() => onResolve(true)}
                    className="h-7 px-3 text-xs"
                >
                    Confirm
                </Button>
                <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => onResolve(false)}
                    className="h-7 px-3 text-xs"
                >
                    Reject
                </Button>
            </div>
        </div>
    );
}
```

- [ ] **Step 2: 验证编译**

Run: `cd D:/projects/my-km && pnpm -F web exec tsc --noEmit`
Expected: 无错误

- [ ] **Step 3: 提交**

```bash
git add apps/web/src/components/workspace/ai-panel/tool-confirmation-dialog.tsx
git commit -m "feat(ai-panel): add ToolConfirmationDialog for AI write tool calls"
```

---

### Task 12: 在 AIPanel 中集成 FrontendToolExecutor

**Files:**
- Modify: `apps/web/src/components/workspace/ai-panel/ai-panel.tsx`

- [ ] **Step 1: 修改 AIPanel 集成调度器**

打开 `apps/web/src/components/workspace/ai-panel/ai-panel.tsx`，在文件顶部 imports 区域添加：

```typescript
import { container } from '@/platform/bootstrap';
import { DocumentStore } from '@/platform/document-store/service';
import { EditorContainer } from '@/platform/editor/container/editor-container';
import type { FileSystemService } from '@/platform/file-system/service';
import { FrontendToolExecutor } from '@/features/ai/tools/frontend-tool-executor';
import type { ConfirmationRequest } from '@/features/ai/tools/types';
import { GetChildItemsHandler } from '@/features/ai/tools/handlers/get-child-items';
import { GetDocumentContentHandler } from '@/features/ai/tools/handlers/get-document-content';
import { InsertTextHandler } from '@/features/ai/tools/handlers/insert-text';
import { SpliceTextHandler } from '@/features/ai/tools/handlers/splice-text';
import { ToolConfirmationDialog } from './tool-confirmation-dialog';
```

确保已有的 `useEffect` / `useState` / `useMemo` / `useRef` / `useCallback` 都在 react 导入中。

- [ ] **Step 2: 在 AIPanel 函数体中初始化 executor 并处理 interrupt**

找到 `AIPanel` 函数内 `const messagesEndRef = useRef<HTMLDivElement>(null);` 这一行（约第 41 行），在其后添加：

```typescript
    // 工具执行器（单例 per panel）— 注册 4 个 handler
    const toolExecutor = useMemo(() => {
        const documentStore = container.get<DocumentStore>(DocumentStore);
        const editorContainer = container.get<EditorContainer>(EditorContainer);
        const fileSystemService = container.get('FileSystemService') as FileSystemService;
        const getProjectRoot = () => {
            const project = useWorkspaceStore.getState().project.currentProject;
            return project ? `file:///${project.name}` : null;
        };

        const exec = new FrontendToolExecutor();
        exec.register(new GetDocumentContentHandler(documentStore, editorContainer, fileSystemService));
        exec.register(new GetChildItemsHandler(fileSystemService, getProjectRoot));
        exec.register(new InsertTextHandler(documentStore, editorContainer, fileSystemService));
        exec.register(new SpliceTextHandler(documentStore, editorContainer, fileSystemService));
        return exec;
    }, []);

    // 当前等待用户确认的请求
    const [pendingConfirmation, setPendingConfirmation] = useState<ConfirmationRequest | null>(null);

    useEffect(() => {
        const sub = toolExecutor.onConfirmationRequest(req => {
            setPendingConfirmation(req);
        });
        return () => sub.dispose();
    }, [toolExecutor]);

    // interrupt 到来时自动分发到执行器
    useEffect(() => {
        if (!interrupt) return;
        let cancelled = false;
        toolExecutor
            .dispatch(interrupt.toolName, interrupt.input)
            .then(result => {
                if (cancelled) return;
                resumeWithToolResult(interrupt.toolCallId, result);
            });
        return () => {
            cancelled = true;
        };
    }, [interrupt, toolExecutor, resumeWithToolResult]);
```

- [ ] **Step 3: 删除占位的 handleToolConfirm 和原有的内联 interrupt UI**

在 AIPanel 函数体中找到这段代码（约第 129-136 行）：

```typescript
    // 工具中断确认处理
    const handleToolConfirm = useCallback(
        (toolCallId: string) => {
            // TODO: Phase 4 — 实际执行前端工具并返回结果
            resumeWithToolResult(toolCallId, { confirmed: true });
        },
        [resumeWithToolResult],
    );
```

删除整个 `handleToolConfirm` 定义。

然后找到 JSX 中的工具中断确认 UI 块（约第 212-234 行）：

```tsx
                        {/* 工具中断确认 UI */}
                        {interrupt && (
                            <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3">
                                <div className="mb-2 flex items-center gap-2">
                                    <div className="h-2 w-2 animate-pulse rounded-full bg-amber-500" />
                                    <span className="font-mono text-amber-400 text-xs">
                                        {interrupt.toolName}
                                    </span>
                                </div>
                                <pre className="mb-2 overflow-auto rounded bg-black/20 p-2 text-[11px] text-ws-fg-secondary">
                                    {JSON.stringify(interrupt.input, null, 2)}
                                </pre>
                                <div className="flex gap-2">
                                    <Button
                                        size="sm"
                                        onClick={() => handleToolConfirm(interrupt.toolCallId)}
                                        className="h-7 px-3 text-xs"
                                    >
                                        Confirm
                                    </Button>
                                </div>
                            </div>
                        )}
```

完整替换为：

```tsx
                        {/* 工具中断确认 UI — 仅对写操作显示 */}
                        <ToolConfirmationDialog
                            request={pendingConfirmation}
                            onResolve={approved => {
                                pendingConfirmation?.resolve(approved);
                                setPendingConfirmation(null);
                            }}
                        />
```

- [ ] **Step 4: 调整 textarea disabled 条件**

找到 textarea（约第 272-280 行）的 `disabled={isStreaming || !!interrupt}`，保持不变 — `interrupt` 存在时（即使是读工具自动执行）也禁用输入直至 resume 完成。

- [ ] **Step 5: 验证编译**

Run: `cd D:/projects/my-km && pnpm -F web exec tsc --noEmit`
Expected: 无错误

- [ ] **Step 6: 运行所有 web 测试**

Run: `cd D:/projects/my-km && pnpm -F web test`
Expected: 全部 PASS（包括新增的 ai-tools 测试和原有测试）

- [ ] **Step 7: Lint 检查**

Run: `cd D:/projects/my-km && pnpm -F web lint`
Expected: 无 error（warning 可接受）

- [ ] **Step 8: 提交**

```bash
git add apps/web/src/components/workspace/ai-panel/ai-panel.tsx
git commit -m "feat(ai-panel): integrate FrontendToolExecutor with interrupt/resume flow

- Initialize executor with 4 handlers (document content, child items, insert, splice)
- Auto-dispatch on interrupt arrival, resume with result
- Show ToolConfirmationDialog for write tools, auto-execute reads"
```

---

## Phase 7：最终验证

### Task 13: 全量构建和测试

**Files:**
- N/A（验证步骤）

- [ ] **Step 1: 全量构建**

Run: `cd D:/projects/my-km && pnpm build`
Expected: 所有包构建成功，无错误

- [ ] **Step 2: 全量测试**

Run: `cd D:/projects/my-km && pnpm test`
Expected: 所有测试通过

- [ ] **Step 3: 全量 lint**

Run: `cd D:/projects/my-km && pnpm lint`
Expected: 无 error

- [ ] **Step 4: 手动 smoke test 检查清单（仅记录，不执行）**

记录以下需要在浏览器中验证的场景到 PR 描述：

1. 在 AI 面板中向 LLM 说："读取当前文档的内容" → 应自动调用 `get_document_content`，无需确认，AI 收到内容
2. "列出项目根目录下的文件" → 应自动调用 `get_child_items`，无需确认
3. "在当前文档末尾插入一行 hello" → 应弹出 `ToolConfirmationDialog`，点击 Confirm 后插入成功
4. 重复上一条但点击 Reject → AI 收到 "User rejected the operation"
5. "把文档第 5 个字符开始的 3 个字符替换为 'world'" → 应弹出确认，执行成功

- [ ] **Step 5: 创建 PR**

```bash
git push -u origin HEAD
gh pr create --title "feat(ai): implement 4 LLM tools (document content / child items / insert / splice)" --body "$(cat <<'EOF'
## Summary

Implements 4 LLM tools per spec [`docs/superpowers/specs/2026-06-11-llm-tool-implementation-design.md`](docs/superpowers/specs/2026-06-11-llm-tool-implementation-design.md):

- `get_document_content` (read) — fetch document text with optional line range
- `get_child_items` (read) — list children under a directory up to N levels
- `insert_text` (write) — insert text at cursor or end of document
- `splice_text` (write) — JavaScript splice-style edit on document text

All tools execute on the frontend via LangGraph interrupt/resume. Reads auto-execute; writes show a confirmation dialog.

## Smoke test checklist

- [ ] "读取当前文档的内容" → auto-executes `get_document_content`
- [ ] "列出项目根目录下的文件" → auto-executes `get_child_items`
- [ ] "在当前文档末尾插入一行 hello" → confirmation dialog → confirm → success
- [ ] Same as above but Reject → AI receives "User rejected the operation"
- [ ] "把文档第 5 个字符开始的 3 个字符替换为 'world'" → confirmation → success

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Expected: PR 创建成功

---

## Self-Review

### Spec coverage

| Spec 章节 | 覆盖任务 |
|-----------|----------|
| `get_document_content` 工具 | Task 1 (schema), Task 6 (handler) |
| `get_child_items` 工具 | Task 1 (schema), Task 7 (handler) |
| `insert_text` 工具 | Task 1 (schema), Task 8 (handler) |
| `splice_text` 工具 | Task 1 (schema), Task 5 (EditorService 方法), Task 9 (handler) |
| `FrontendToolExecutor` 核心调度器 | Task 10 |
| 确认 UI (`ToolConfirmationDialog`) | Task 11 |
| 与 `use-langgraph-stream` 集成 | Task 12 |
| 后端 `frontendTools` 启用 | Task 2 |
| 共享 schema 更新 | Task 1 |
| `.km` 文件解析 | Task 4 |
| 错误处理（每种 case 返回给 LLM） | 每个 handler 测试都覆盖 |
| Handler 依赖关系（DocumentStore、EditorContainer、FileSystemService） | 各 handler constructor 注入 |

无遗漏。

### 类型一致性

- `EditorService.spliceText()` 签名（Task 5）与 `InsertTextHandler`/`SpliceTextHandler` 中调用一致：返回 `{ success, error?, charsDeleted, charsInserted }`
- `FrontendToolHandler` 接口（Task 3）的 `name` / `type` / `execute` / `describe` 在 4 个 handler（Task 6-9）中实现一致
- `EditorContainer.getService(documentId)` 返回 `EditorService | null` — handler 中正确处理 null 分支
- `ConfirmationRequest.resolve` 在 `FrontendToolExecutor`（Task 10）中通过 Promise 创建并传递，在 `ToolConfirmationDialog`（Task 11）和 `AIPanel`（Task 12）中正确调用

### Placeholder scan

- 所有 TDD 测试都包含完整可运行代码
- 所有实现步骤都给出完整文件内容或精确的修改片段
- 提交命令、运行命令、预期输出都明确
- 无 TBD/TODO（除已删除的原占位 `handleToolConfirm` 中的 TODO）

### 已知限制（设计层面，spec 已覆盖）

- `splice_text` 对已打开文档使用基于纯文本的实现（通过 `getFullContent` + 重建段落），会丢失富文本格式 — 这是 spec 接受的权衡，已在 Task 5 代码注释中标注
- 未打开文档的 `splice_text` 写回时会把整个文档重建为段落数组，同样丢失格式

---

**Plan complete.** 计划已保存到 `docs/superpowers/plans/2026-06-11-llm-tool-implementation.md`。
