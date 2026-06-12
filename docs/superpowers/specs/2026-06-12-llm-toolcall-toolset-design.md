# LLM Toolcall 工具集设计

**日期**: 2026-06-12
**状态**: Draft
**替代**: 现有 4 个工具 (`get_document_content`, `get_child_items`, `insert_text`, `splice_text`)

## 目标

设计一套分层抽象的 LLM toolcall 工具集，覆盖文档编辑的完整流程：文件管理、文档读取、内容编辑（text/block/inline 级别）、多维度搜索。

## 设计原则

- **分层抽象**：按操作层级（文件/文档/搜索）组织工具，每层 1-2 个工具
- **统一接口**：同一工具通过 `operation`/`type` 参数支持多种操作
- **读写分离**：读操作自动执行，写操作根据确认策略决定
- **向后兼容**：新工具替代现有 4 个工具，保持前端执行架构不变

## 工具总览

| 工具 | 层级 | 替代现有 | 说明 |
|------|------|---------|------|
| `file_ops` | 文件层 | `get_child_items` | 文件/目录 CRUD + 列表 |
| `doc_read` | 文档层 | `get_document_content` | 结构化文档读取（text/blocks/raw） |
| `doc_edit` | 文档层 | `insert_text` + `splice_text` | 统一编辑入口（text/block/inline） |
| `search` | 搜索层 | 无（新增） | 4 种搜索模式 |

---

## 1. `file_ops` — 文件/文件夹操作

处理 .km 文件和目录的 CRUD 操作，不涉及文档内容编辑。

### 参数

```typescript
interface FileOpsParams {
  operation: "list" | "create" | "delete" | "move" | "rename" | "copy";
  path: string;              // 目标路径（相对于工作区根目录）
  destination?: string;      // move/copy 时的目标路径
  type?: "file" | "folder";  // create 时指定类型
  recursive?: boolean;       // list 时是否递归
  depth?: number;            // list 时的递归深度
}
```

### 操作说明

| operation | 说明 | 返回值 | 需要确认 |
|-----------|------|--------|---------|
| `list` | 列出目录内容 | `{ items: FileInfo[] }` | 否 |
| `create` | 创建新文件或文件夹 | `{ success: boolean, path: string }` | 是 |
| `delete` | 删除文件或文件夹 | `{ success: boolean }` | 是 |
| `move` | 移动到新路径 | `{ success: boolean, newPath: string }` | 是 |
| `rename` | 重命名 | `{ success: boolean, newPath: string }` | 是 |
| `copy` | 复制到新路径 | `{ success: boolean, newPath: string }` | 是 |

---

## 2. `doc_read` — 文档内容读取

读取文档内容，支持纯文本和结构化两种输出格式。

### 参数

```typescript
interface DocReadParams {
  // 目标标识（二选一）
  path?: string;           // 未打开文档的文件路径
  documentId?: string;     // 已打开文档的 ID

  // 读取范围
  range?: {
    type: "full" | "blocks" | "text-range";
    // blocks 模式：按 block ID 或索引范围
    blockIds?: string[];
    blockRange?: { start: number; end: number };
    // text-range 模式：按行范围
    startLine?: number;
    endLine?: number;
  };

  // 输出格式
  format?: "text" | "blocks" | "raw";  // 默认 "text"
}
```

### format 说明

| format | 说明 | 适用场景 |
|--------|------|---------|
| `text` | 纯文本（现有行为） | LLM 理解内容、文本编辑 |
| `blocks` | JSON 结构化 block 数据（含类型、属性） | Block 级操作前了解结构 |
| `raw` | 原始 .km JSON | 调试、高级操作 |

### range.type 说明

| type | 说明 |
|------|------|
| `full` | 读取整个文档（默认） |
| `blocks` | 按指定 block ID 或索引范围读取 |
| `text-range` | 按行范围读取（现有行为） |

---

## 3. `doc_edit` — 文档内容编辑

统一的文档编辑入口，支持 text/block/inline 三个级别的操作。

### 参数

```typescript
interface DocEditParams {
  // 目标标识（二选一）
  path?: string;
  documentId?: string;

  // 编辑操作
  operation: {
    type: "splice-text" | "insert-text" | "replace-block" | "insert-block"
        | "delete-block" | "move-block" | "insert-inline" | "format-inline";

    // --- text 操作 ---
    position?: number;          // splice-text: 字符偏移量
    deleteCount?: number;       // splice-text: 删除字符数
    text?: string;              // insert-text / splice-text: 插入的文本内容

    // --- block 操作 ---
    blockId?: string;           // 目标 block ID
    blockType?: string;         // insert-block 时的 block 类型（paragraph/heading/list/quote/code/table/image/formula）
    content?: any;              // block 内容（JSON 或文本）
    afterBlockId?: string;      // insert-block: 在此 block 之后插入
    beforeBlockId?: string;     // insert-block: 在此 block 之前插入
    targetIndex?: number;       // move-block: 移动到指定索引位置

    // --- inline 操作 ---
    range?: { start: number; end: number };  // inline 操作的字符范围
    format?: "bold" | "italic" | "underline" | "strikethrough"
           | "code" | "link" | "formula";
    url?: string;               // format=link 时的 URL
    formula?: string;           // format=formula 时的公式内容
  };
}
```

### 操作类型说明

#### Text 级别（兼容现有工具）

| type | 说明 | 必需参数 |
|------|------|---------|
| `splice-text` | 删除并插入文本 | `position`, `deleteCount?`, `text?` |
| `insert-text` | 在光标位置或文档末尾插入文本 | `text`, `position?` |

#### Block 级别

| type | 说明 | 必需参数 |
|------|------|---------|
| `insert-block` | 插入新 block | `blockType`, `content`, `afterBlockId?` 或 `beforeBlockId?` |
| `replace-block` | 替换整个 block 内容 | `blockId`, `content` |
| `delete-block` | 删除 block | `blockId` |
| `move-block` | 移动 block 位置 | `blockId`, `targetIndex` |

#### Inline 级别

| type | 说明 | 必需参数 |
|------|------|---------|
| `format-inline` | 对范围内文本应用格式 | `blockId`, `range`, `format`, `url?`, `formula?` |
| `insert-inline` | 在指定位置插入 inline 元素 | `blockId`, `position`, `format`, `url?`, `formula?` |

---

## 4. `search` — 统一搜索接口

统一的搜索接口，通过 `type` 参数支持 4 种搜索模式。

### 参数

```typescript
interface SearchParams {
  type: "text" | "grep" | "metadata" | "semantic";

  query: string;               // 搜索关键词/表达式

  // text: 文档内搜索
  path?: string;               // 限定在某个文档内

  // grep: 跨文件文本搜索
  scope?: string[];            // 限定搜索路径范围（glob 模式）
  caseSensitive?: boolean;     // 大小写敏感，默认 false
  regex?: boolean;             // 正则匹配，默认 false

  // metadata: 结构化搜索
  filters?: {
    title?: string;            // 标题匹配
    tags?: string[];           // 包含的标签
    dateRange?: { from: string; to: string };  // 日期范围
    hasBlocks?: string[];      // 包含的 block 类型
  };

  // semantic: 语义搜索（向量检索）
  topK?: number;               // 返回结果数量，默认 5
  threshold?: number;          // 相似度阈值 0-1

  // 通用
  maxResults?: number;         // 最大结果数，默认 20
  includeContent?: boolean;    // 是否返回匹配内容片段，默认 true
}
```

### 搜索类型说明

| type | 说明 | 实现方式 |
|------|------|---------|
| `text` | 单文档内文本搜索 | 前端字符串搜索 |
| `grep` | 跨文件文本搜索 | 后端文件遍历 + 正则 |
| `metadata` | 按标题/标签/日期等搜索 | 数据库查询 |
| `semantic` | 语义相似度搜索 | pgvector 向量检索 |

### 返回值

```typescript
interface SearchResult {
  matches: Array<{
    path: string;              // 文件路径
    documentId?: string;       // 文档 ID（如果已打开）
    score?: number;            // 相关性分数（semantic 模式）
    line?: number;             // 匹配行号
    column?: number;           // 匹配列号
    snippet?: string;          // 匹配内容片段
    metadata?: {               // metadata 模式额外信息
      title: string;
      tags: string[];
      updatedAt: string;
    };
  }>;
  totalMatches: number;
  truncated: boolean;          // 结果是否被截断
}
```

---

## 5. 确认策略系统

独立的运行时配置，控制 LLM 编辑操作的审批流程。

### 策略定义

```typescript
type ConfirmationStrategy =
  | { mode: "bypass" }                // 自动通过所有操作
  | { mode: "confirm-write" }         // 写操作需确认（默认）
  | { mode: "confirm-all" }           // 所有操作需确认
  | { mode: "confirm-destructive" };  // 仅破坏性操作需确认
```

### 策略说明

| 模式 | 读操作 | 写操作 | 破坏性操作 | 适用场景 |
|------|--------|--------|-----------|---------|
| `bypass` | 自动 | 自动 | 自动 | 信任 LLM，快速迭代 |
| `confirm-write` | 自动 | 确认 | 确认 | 日常使用（默认） |
| `confirm-all` | 确认 | 确认 | 确认 | 谨慎审查 |
| `confirm-destructive` | 自动 | 自动 | 确认 | 流畅但有安全网 |

### 破坏性操作判定

以下操作被判定为"破坏性"：
- `file_ops` 的 `delete` 操作
- `doc_edit` 的 `delete-block` 操作
- `doc_edit` 的 `splice-text`（当 `deleteCount > 0` 时）
- `file_ops` 的 `move`（当目标路径已存在时）

### 配置位置

策略作为 AI Panel 的设置项，用户可随时切换。默认为 `confirm-write`。

---

## 6. 完整编辑流程示例

### 场景：LLM 重构一篇文档的结构

```
1. file_ops(list) → 了解工作区文件结构
2. doc_read(format="blocks") → 了解文档结构
3. doc_edit(delete-block) → 删除多余的标题
4. doc_edit(move-block) → 移动段落顺序
5. doc_edit(insert-block) → 插入新的总结段落
6. doc_edit(format-inline, format="bold") → 加粗关键术语
```

### 场景：LLM 跨文档整理知识

```
1. search(type="semantic", query="机器学习基础") → 找到相关文档
2. doc_read(path="notes/ml-basics.km") → 读取相关文档内容
3. doc_edit(type="insert-text", text="...总结内容...") → 在目标文档中插入整理后的内容
```

### 场景：LLM 搜索并修复格式问题

```
1. search(type="grep", query="TODO", scope=["notes/*.km"]) → 找到所有待办
2. doc_read(path, format="blocks", range={type:"blocks", blockRange:{start:3,end:5}}) → 查看上下文
3. doc_edit(format-inline, format="strikethrough") → 给已完成的 TODO 加删除线
```

---

## 7. 与现有架构的兼容性

### 保持不变的部分

- **LangGraph Interrupt/Resume 流程**：工具执行仍通过前端 interrupt 机制
- **FrontendToolExecutor 架构**：分发器模式不变，只需注册新 handler
- **SSE 通信**：事件流协议不变
- **ToolConfirmationDialog**：确认 UI 不变，支持策略模式

### 需要修改的部分

- **工具定义**：`packages/shared/src/ai/tools/index.ts` — 新的 4 个工具定义
- **Backend 工具注册**：`apps/server/src/ai/tools/tool-definitions.ts` — LangChain 工具注册
- **Frontend Handlers**：`apps/web/src/features/ai/tools/handlers/` — 新增/替换 handler
- **FrontendToolExecutor**：`apps/web/src/features/ai/tools/frontend-tool-executor.ts` — 路由到新 handler
- **策略系统**：新增确认策略配置模块
