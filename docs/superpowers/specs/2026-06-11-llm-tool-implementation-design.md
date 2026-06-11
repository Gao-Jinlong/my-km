# LLM 工具实现设计

> 日期：2026-06-11
> 状态：Approved

## 概述

实现 4 个 LLM 工具，让 AI 助手能够读取文档内容、浏览文件树、插入和拼接文本。工具全部在前端执行，通过 LangGraph interrupt/resume 协议与 LLM 交互。

## 背景

当前后端的 LLM 工具只有占位代码：
- `tool-definitions.ts` 中 `frontendTools` 数组被注释
- 前端没有工具执行器注册和分发机制
- interrupt 到 resume 之间没有实际执行逻辑

已有的基础设施：
- `tool-node.ts` 通过 `interrupt()` 暂停 graph，等待前端 resume
- `use-langgraph-stream.ts` 已有 `ToolInterrupt` 接口和 `resumeWithToolResult()`
- `EditorService` 已有 `getFullContent()`、`insertTextAtCursor()`、`replaceSelection()` 等方法
- `FileSystemService` 已有 `readFile()`、`writeFile()`、`listFiles()` 等方法
- `DocumentStore` 维护已打开文档的元数据

## 设计决策

| 决策 | 选择 | 理由 |
|------|------|------|
| 执行位置 | 全部前端 | 文档在浏览器文件系统，无后端文档 API |
| 文档范围 | 任意项目中文档 | 已打开文档通过 EditorService，未打开通过 FileSystemService |
| 确认策略 | 读写分离 | 读操作自动执行，写操作需用户确认 |
| 实现范围 | 一步到位 | 包含任意文档支持和完整错误处理 |

## 整体架构

### 数据流

```
LLM 决定调用工具
  → tool-node.ts 调用 interrupt({ tool_call_id, tool_name, args })
  → SSE 推送 __interrupt__ 事件
  → 前端 use-langgraph-stream 检测到 interrupt
  → FrontendToolExecutor.dispatch(toolName, args)
      ├─ 读操作 → 自动执行 → resumeWithToolResult(result)
      └─ 写操作 → 弹出确认 UI → 用户确认 → 执行 → resumeWithToolResult(result)
  → 后端 tool-node 收到 resumeValue
  → 构建 ToolMessage 追加到 state.messages
  → LLM 收到执行结果，决定下一步
```

### 模块划分

```
前端新增:
├── features/ai/tools/
│   ├── frontend-tool-executor.ts    ← 核心调度器
│   ├── handlers/
│   │   ├── get-document-content.ts  ← get_document_content 处理器
│   │   ├── get-child-items.ts       ← get_child_items 处理器
│   │   ├── insert-text.ts           ← insert_text 处理器
│   │   └── splice-text.ts           ← splice_text 处理器
│   └── types.ts                     ← 工具执行相关类型

前端修改:
├── hooks/use-langgraph-stream.ts    ← 集成 FrontendToolExecutor
├── components/                       ← ToolConfirmationDialog 确认 UI

后端修改:
├── ai/tools/tool-definitions.ts     ← 取消注释 + 更新名称

共享包修改:
├── packages/shared/src/ai/tools/    ← 更新 schema 定义
```

## 工具详细设计

### 1. `get_document_content` — 获取文档内容

**类型：** 读操作（自动执行，无需确认）

**输入 Schema：**

```json
{
  "documentId": { "type": "string", "description": "文档 ID" },
  "startLine": { "type": "number", "description": "起始行号，从 1 开始（可选）" },
  "endLine": { "type": "number", "description": "结束行号，含此行（可选）" }
}
```

**执行逻辑：**

1. 通过 `DocumentStore.get(documentId)` 获取文档元数据（path, title）
2. 获取文档文本内容：
   - **已打开文档**（有对应 EditorService 实例）→ `editorService.getFullContent()`
   - **未打开文档** → `FileSystemService.readFile(path)` + 解析 `.km` 文件提取纯文本
3. 按行号切片（如有 `startLine`/`endLine`）：
   - 不传 → 返回全文
   - 只传 `startLine` → 返回从该行到末尾
   - 都传 → 返回指定行范围
4. 返回结果

**返回值：**

```json
{
  "success": true,
  "content": "文档文本内容...",
  "totalLines": 42,
  "startLine": 1,
  "endLine": 42,
  "documentId": "doc-xxx",
  "title": "会议记录"
}
```

**错误情况：**
- 文档不存在 → `{ success: false, error: "Document not found: {documentId}" }`
- 行号越界 → `{ success: false, error: "Line range out of bounds: startLine={n}, totalLines={m}" }`

---

### 2. `get_child_items` — 获取子项

**类型：** 读操作（自动执行，无需确认）

**输入 Schema：**

```json
{
  "root": { "type": "string", "description": "根路径，默认项目根目录（可选）" },
  "depth": { "type": "number", "description": "递归深度，默认 1（可选）", "default": 1 }
}
```

**执行逻辑：**

1. 解析 `root`：未提供则使用项目根目录路径（从 workspace 状态获取）
2. 从 `root` 开始，递归 `depth` 层，通过 `FileSystemService.listFiles()` 遍历
3. 构建树结构，包含文件和目录信息

**返回值：**

```json
{
  "success": true,
  "root": "/notes",
  "items": [
    {
      "name": "meeting.km",
      "type": "file",
      "path": "/notes/meeting.km"
    },
    {
      "name": "projects",
      "type": "directory",
      "path": "/notes/projects",
      "children": [
        {
          "name": "plan.km",
          "type": "file",
          "path": "/notes/projects/plan.km"
        }
      ]
    }
  ]
}
```

**错误情况：**
- 路径不存在 → `{ success: false, error: "Path not found: {root}" }`
- 权限不足 → `{ success: false, error: "Access denied: {root}" }`

---

### 3. `insert_text` — 插入文本

**类型：** 写操作（需要用户确认）

**输入 Schema：**

```json
{
  "text": { "type": "string", "description": "要插入的文本" },
  "documentId": { "type": "string", "description": "文档 ID（必填）" },
  "position": { "type": "string", "enum": ["end", "cursor"], "description": "插入位置，默认 end（可选）", "default": "end" }
}
```

**执行逻辑：**

1. 通过 `documentId` 定位文档
2. **弹出确认 UI**：展示"将在文档「{title}」的{位置}插入文本"
3. 用户确认后执行：
   - **已打开文档**：
     - `position=cursor` → `editorService.insertTextAtCursor(text)`
     - `position=end` → 追加到编辑器内容末尾（通过 Lexical API 操作 root 的最后一个子节点）
   - **未打开文档**：`FileSystemService.readFile()` → 追加文本 → `FileSystemService.writeFile()`
4. 返回结果

**返回值：**

```json
{
  "success": true,
  "documentId": "doc-xxx"
}
```

**错误情况：**
- 文档不存在 → `{ success: false, error: "Document not found: {documentId}" }`
- 用户拒绝 → `{ success: false, error: "User rejected the operation" }`
- 编辑器未初始化（cursor 模式且无选区）→ `{ success: false, error: "No cursor position available" }`

---

### 4. `splice_text` — 文本拼接操作

**类型：** 写操作（需要用户确认）

**输入 Schema：**

```json
{
  "documentId": { "type": "string", "description": "文档 ID（必填）" },
  "start": { "type": "number", "description": "起始字符位置，从 0 开始" },
  "deleteCount": { "type": "number", "description": "删除的字符数" },
  "insert": { "type": "string", "description": "要插入的文本（可选，不传则只删除）" }
}
```

类似 JavaScript 的 splice 操作：
- `splice_text(doc, 10, 0, "hello")` → 在位置 10 纯插入 "hello"
- `splice_text(doc, 10, 5, "world")` → 删除位置 10-14 的字符，插入 "world"
- `splice_text(doc, 10, 3)` → 删除位置 10-12 的字符

**执行逻辑：**

1. 通过 `documentId` 定位文档
2. 获取当前文本内容：
   - **已打开文档** → `editorService.getFullContent()`
   - **未打开文档** → `FileSystemService.readFile()` + 解析
3. **弹出确认 UI**：展示变更预览（位置、删除字符数、插入文本预览）
4. 用户确认后执行拼接：
   - `before = content.slice(0, start)`
   - `after = content.slice(start + deleteCount)`
   - `newContent = before + (insert || '') + after`
5. 写回：
   - **已打开文档** → 通过 Lexical `editor.update()` 精确替换文本节点
   - **未打开文档** → `FileSystemService.writeFile()`
6. 返回结果

**返回值：**

```json
{
  "success": true,
  "documentId": "doc-xxx",
  "charsDeleted": 5,
  "charsInserted": 11
}
```

**错误情况：**
- 文档不存在 → `{ success: false, error: "Document not found: {documentId}" }`
- start 越界 → `{ success: false, error: "Start position {n} out of bounds (content length: {m})" }`
- 用户拒绝 → `{ success: false, error: "User rejected the operation" }`

## 核心调度器：FrontendToolExecutor

### 类设计

```typescript
// features/ai/tools/types.ts

export interface ToolHandler {
  /** 工具名称，与 shared schema 中的 name 一致 */
  name: string;
  /** 操作类型：read 自动执行，write 需要确认 */
  type: 'read' | 'write';
  /** 执行工具逻辑 */
  execute(args: Record<string, unknown>): Promise<ToolResult>;
}

export interface ToolResult {
  success: boolean;
  error?: string;
  [key: string]: unknown;
}

export interface ConfirmationRequest {
  toolName: string;
  input: Record<string, unknown>;
  description: string;  // 人类可读的操作描述
}
```

```typescript
// features/ai/tools/frontend-tool-executor.ts

export class FrontendToolExecutor {
  private handlers = new Map<string, ToolHandler>();
  private _onConfirmationRequest = new Emitter<ConfirmationRequest>();

  constructor() {
    this.register(new GetDocumentContentHandler());
    this.register(new GetChildItemsHandler());
    this.register(new InsertTextHandler());
    this.register(new SpliceTextHandler());
  }

  register(handler: ToolHandler): void {
    this.handlers.set(handler.name, handler);
  }

  async dispatch(
    toolName: string,
    input: Record<string, unknown>,
  ): Promise<ToolResult> {
    const handler = this.handlers.get(toolName);
    if (!handler) {
      return { success: false, error: `Unknown tool: ${toolName}` };
    }

    // 读操作直接执行
    if (handler.type === 'read') {
      return handler.execute(input);
    }

    // 写操作需要确认
    const approved = await this.requestConfirmation(toolName, input);
    if (!approved) {
      return { success: false, error: 'User rejected the operation' };
    }

    return handler.execute(input);
  }

  private requestConfirmation(
    toolName: string,
    input: Record<string, unknown>,
  ): Promise<boolean> {
    return new Promise((resolve) => {
      this._onConfirmationRequest.fire({
        toolName,
        input,
        description: this.describeOperation(toolName, input),
      });
      // 由 UI 组件调用 resolveConfirmation(true/false)
      this._pendingConfirmation = resolve;
    });
  }

  resolveConfirmation(approved: boolean): void {
    this._pendingConfirmation?.(approved);
    this._pendingConfirmation = null;
  }
}
```

### 确认 UI

`<ToolConfirmationDialog>` 组件：
- 监听 `FrontendToolExecutor.onConfirmationRequest` 事件
- 渲染确认对话框：工具名称 + 操作摘要 + 确认/拒绝按钮
- 用户操作后调用 `executor.resolveConfirmation(approved)`

### 与 use-langgraph-stream 集成

在消费 `useLangGraphStream` 的 AI 面板组件中：

```typescript
const toolExecutor = useMemo(() => new FrontendToolExecutor(), []);

useEffect(() => {
  if (!interrupt) return;

  toolExecutor
    .dispatch(interrupt.toolName, interrupt.input)
    .then(result => resumeWithToolResult(interrupt.toolCallId, result))
    .catch(error => resumeWithToolResult(interrupt.toolCallId, {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    }));
}, [interrupt]);
```

### 错误处理策略

所有错误都返回给 LLM（通过 ToolMessage），不中断对话流：

| 错误场景 | 返回给 LLM | LLM 行为 |
|----------|-----------|---------|
| 未知工具名 | `{ success: false, error: "Unknown tool: ..." }` | 告知用户工具不可用 |
| 文档不存在 | `{ success: false, error: "Document not found: ..." }` | 检查 ID 或建议列表 |
| 行号越界 | `{ success: false, error: "Line range out of bounds..." }` | 调整参数重试 |
| 用户拒绝 | `{ success: false, error: "User rejected..." }` | 告知用户并建议替代方案 |
| 文件系统异常 | `{ success: false, error: "IO error: ..." }` | 建议用户检查文件 |

## 后端变更

### 需要修改的文件

| 文件 | 变更 |
|------|------|
| `packages/shared/src/ai/tools/index.ts` | 更新 4 个工具 schema：添加行号参数、重命名 get_child_items/splice_text、更新 insert_text |
| `packages/shared/src/ai/index.ts` | 导出新名称 |
| `apps/server/src/ai/tools/tool-definitions.ts` | 取消注释 frontendTools，更新 FRONTEND_TOOLS 集合名称 |
| `apps/server/src/__mocks__/@my-km/shared.ts` | 同步更新 mock 导出 |

### 不需要修改的文件

- `tool-node.ts` — interrupt 逻辑通用
- `ai.service.ts` — executeRunProtocol 不变
- `tool-router.ts` — 保留供未来 backend 工具
- `use-langgraph-stream.ts` — 已有完整的 interrupt/resume 机制

## Handler 依赖关系

每个 handler 通过 DI 容器获取前端服务：

| Handler | 依赖的服务 |
|---------|-----------|
| GetDocumentContentHandler | DocumentStore, FileSystemService, EditorTabService |
| GetChildItemsHandler | FileSystemService, workspace store (获取根目录) |
| InsertTextHandler | DocumentStore, FileSystemService, EditorTabService |
| SpliceTextHandler | DocumentStore, FileSystemService, EditorTabService |

## 测试策略

- 每个 handler 单元测试：mock 服务依赖，验证输入输出
- FrontendToolExecutor 集成测试：验证 dispatch 路由和确认流程
- 端到端测试：LLM 调用工具 → interrupt → 执行 → resume → LLM 收到结果
