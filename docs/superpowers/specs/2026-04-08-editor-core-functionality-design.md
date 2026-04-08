# Spec: 编辑器核心功能 — 文件读写同步 + 富文本编辑 + 快捷键

Date: 2026-04-08
Branch: main
Status: DRAFT
Supersedes: (office-hours design ginlon-main-design-20260407-182604.md)

## Problem

编辑器当前是空壳：Lexical 编辑器已搭建，但 `loadDocument`/`saveDocument` 是空实现，Toolbar 没有和 Lexical 联通，EditorService 核心方法全是 TODO。用户打开 Markdown 文件后无法看到格式化内容，也无法编辑后保存回磁盘。

本轮目标：打开 .md 文件 → 渲染为富文本 → 编辑 → 保存回磁盘。

## Constraints

- 文件监听排除在本轮范围外
- 继续用现有 platform/features/components 分层架构
- Block[] 作为文档内容的规范格式（Block 优先原则）
- Markdown 是当前唯一支持的文件序列化格式

## Architecture Decisions

### AD-1: Lexical 编辑器实例统一（解决双实例问题）

**问题**: `EditorService` 在 `EditorService.ts:308` 中通过 `createLexicalEditor()` 创建独立 Lexical 实例，而 `LexicalComposer` 在 `lexical-editor.tsx` 中又创建另一个。两个实例不共享状态。

**方案**: EditorService 不再自行创建 Lexical 实例。

1. `LexicalEditorImpl` 组件在 `LexicalComposer` 渲染后，通过 `useLexicalComposerContext()` 获取实际编辑器实例
2. 通过 `EditorService.setEditor(editor)` 将实例注入 EditorService
3. EditorService 的所有方法操作这个从 React 组件注入的实例

**影响文件**:
- `features/editor/service/EditorService.ts` — 移除 `createLexicalEditor()`，添加 `setEditor()`
- `features/editor/container/EditorContainer.ts` — 工厂函数不再传入 editor 参数
- `components/workspace/editor/lexical-editor.tsx` — 新增 `EditorBridgePlugin`

### AD-2: Block 优先 — 完整内容模型（含 Inline 类型）

**问题**: 当前 `Document.content` 是 `Block[]`，但 Block 内容类型（如 `ParagraphContent = { text: string }`）只存纯文本，无法表示行内格式（bold/italic 等）。Block[] 作为内容规范格式需要具备完整表达能力。

**方案**: 引入 `Inline` 类型系统，让 Block[] 成为完整的内容模型。

#### Inline 类型设计

```typescript
/** 行内格式标记 */
export type InlineMark = 'bold' | 'italic' | 'underline' | 'strikethrough' | 'code' | 'highlight' | 'subscript' | 'superscript';

/** 行内内容单元 */
export interface Inline {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strikethrough?: boolean;
  code?: boolean;
  highlight?: boolean;
  subscript?: boolean;
  superscript?: boolean;
  link?: { url: string; title?: string };
}
```

#### Block 内容类型更新

将 `ParagraphContent`、`HeadingContent`、`QuoteContent`、`ListItem` 的 `text: string` 替换为 `inline: Inline[]`:

```typescript
// Before: { text: "hello **world**" }
// After:  { inline: [{ text: "hello " }, { text: "world", bold: true }] }

export interface ParagraphContent { inline: Inline[]; }
export interface HeadingContent { inline: Inline[]; level: 1|2|3|4|5|6; }
export interface QuoteContent { inline: Inline[]; cite?: string; }
export interface ListItem { id: string; inline: Inline[]; checked?: boolean; }
```

`CodeContent`、`TableContent`、`ImageContent`、`FormulaContent` 保持不变（代码块和表格单元格内容不需要行内格式）。

#### 转换层架构

Block[] 是规范格式，需要两层转换与外部对接：

```
Markdown 文件 ←→ MarkdownSerializer/Parser ←→ Block[] ←→ BlockLexicalConverter ←→ Lexical
```

1. **Markdown ↔ Block[]**: `MarkdownParser`（md → Block[]）和 `MarkdownSerializer`（Block[] → md），基于 markdown-it（已有依赖）
2. **Block[] ↔ Lexical**: `BlockLexicalConverter`，将 Block[] 转为 Lexical 节点树（含行内格式），反之亦然

不再使用 `@lexical/markdown` 的 `$convertFromMarkdownString`/`$convertToMarkdownString` 做主要转换路径。Block[] 是唯一的中间表示。`@lexical/markdown` 的 `MarkdownShortcutPlugin`（输入快捷键如 # → heading）仍可保留。

**影响文件**:
- `features/editor/types/block.ts` — 新增 `Inline`/`InlineMark` 类型，更新内容类型
- `features/editor/types/document.ts` — `content: Block[]` 不变
- `features/editor/converter/markdown-parser.ts` — 新建，Markdown → Block[]
- `features/editor/converter/markdown-serializer.ts` — 新建，Block[] → Markdown
- `features/editor/converter/block-lexical-converter.ts` — 新建，Block[] ↔ Lexical
- `features/editor/registry/builtin-types.ts` — 更新 defaultContent/isValid 匹配新类型
- `features/editor/service/EditorService.ts` — loadDocument/saveDocument 使用转换层
- `components/workspace/editor/content-area.tsx` — 适配新的内容传递

### AD-3: 统一 EditorContainer（选项 C）

**问题**: 存在两套 EditorContainer — features 层（纯类单例）和 platform 层（DI 单例，`createInstance` 抛异常）。

**方案**: platform 层成为唯一权威容器。

1. 重构 `platform/EditorContainer`：移除 `create(HTMLElement)` 等旧接口，改为调用 `createEditorService()` 工厂函数创建实例
2. 删除 `features/editor/container/EditorContainer.ts`，改 index.ts 为 re-export platform 层
3. `lexical-editor.tsx` 从 `EditorContainer.getInstance(blockRegistry)` 改为 `container.get(EditorContainer)`
4. `FileOpenService` 无需改动（已使用 platform 层）

**依赖方向**: features → platform（向下，正确）

**影响文件**:
- `platform/editor/container/editor-container.ts` — 重构
- `features/editor/container/EditorContainer.ts` — 删除
- `features/editor/container/index.ts` — 改为 re-export
- `components/workspace/editor/lexical-editor.tsx` — 改用 DI

### AD-4: 快捷键注册策略

| 快捷键 | 注册位置 | 原因 |
|--------|---------|------|
| Ctrl+B/I/U | Lexical 内置 (RichTextPlugin) | 已由 Lexical 处理 |
| Ctrl+Z/Y/Ctrl+Shift+Z | Lexical 内置 (HistoryPlugin) | 已由 Lexical 处理 |
| Ctrl+S | KeyboardShortcutService (全局) | 保存操作不属于编辑器内部 |
| Ctrl+Shift+S | KeyboardShortcutService (全局) | 另存为 |

## Implementation Details

### 1. Inline 类型与 Block 类型更新

**文件**: `features/editor/types/block.ts`

新增类型:
- `Inline` 接口: `{ text, bold?, italic?, underline?, strikethrough?, code?, highlight?, subscript?, superscript?, link? }`
- `InlineMark` 联合类型

更新内容类型:
- `ParagraphContent`: `text: string` → `inline: Inline[]`
- `HeadingContent`: `text: string` → `inline: Inline[]`
- `QuoteContent`: `text: string` → `inline: Inline[]`
- `ListItem`: `text: string` → `inline: Inline[]`

**文件**: `features/editor/registry/builtin-types.ts`

- 更新 `defaultContent` 生成函数: `{ text: '' }` → `{ inline: [] }`
- 更新 `isValid` 验证: 检查 `Array.isArray(content.inline)`

**文件**: `features/editor/types/document.ts`

- `content: Block[]` 保持不变

### 2. Markdown ↔ Block[] 转换层

**新文件**: `features/editor/converter/markdown-parser.ts`

- 使用 `markdown-it`（已有依赖）解析 Markdown 为 token AST
- 遍历 AST，生成 Block[]:
  - `heading_open/close` → HeadingBlock（提取 level）
  - `paragraph_open/close` → ParagraphBlock（提取 inline 格式）
  - `bullet_list_open/close` → ListBlock（listType: 'bullet'）
  - `ordered_list_open/close` → ListBlock（listType: 'number'）
  - `blockquote_open/close` → QuoteBlock
  - `code_block` / `fence` → CodeBlock
  - 行内格式: `strong_open/close` → bold, `em_open/close` → italic, `code_inline` → code, `s` → strikethrough
  - `link_open/close` → link with url
- 生成 nanoid 作为 Block ID

**新文件**: `features/editor/converter/markdown-serializer.ts`

- 遍历 Block[]，生成 Markdown 字符串:
  - HeadingBlock → `# text`（根据 level 添加 #）
  - ParagraphBlock → 将 Inline[] 序列化为 Markdown（`**bold**`、`*italic*` 等）
  - ListBlock → `- item` / `1. item`（根据 listType）
  - QuoteBlock → `> text`
  - CodeBlock → ``` code fence
- Inline 序列化: 遍历 Inline[]，根据 marks 添加 Markdown 语法
  - bold → `**text**`, italic → `*text*`, code → `` `text` ``
  - underline → `<u>text</u>`（Markdown 无原生语法）
  - strikethrough → `~~text~~`
  - link → `[text](url)`

### 3. Block[] ↔ Lexical 转换层

**新文件**: `features/editor/converter/block-lexical-converter.ts`

**Block[] → Lexical** (`blocksToLexical`):
- 遍历 Block[]
- HeadingBlock → `$createHeadingNode(level)` + Inline[] → `$createTextNode`（带 format flags）
- ParagraphBlock → `$createParagraphNode` + Inline[] → `$createTextNode`
- ListBlock → `$createListNode` + items → `$createListItemNode`
- QuoteBlock → `$createQuoteNode`
- CodeBlock → `$createCodeNode`
- Inline → TextNode: 根据 bold/italic/underline 等设置 IS_BOLD/IS_ITALIC 等 format bit

**Lexical → Block[]** (`lexicalToBlocks`):
- 遍历 Lexical 节点树
- HeadingNode → HeadingBlock（提取 level，子节点 → Inline[]）
- ParagraphNode → ParagraphBlock（子节点 → Inline[]）
- ListNode → ListBlock
- QuoteNode → QuoteBlock
- CodeNode → CodeBlock
- TextNode → Inline: 检查 format bit (IS_BOLD, IS_ITALIC 等) 转为 Inline 属性

### 4. EditorService 补全

**文件**: `features/editor/service/EditorService.ts`

- 添加 `setEditor(editor: LexicalEditor)` 方法
- 添加 `filePath: string` 属性
- `loadDocument(doc)`: 使用 `BlockLexicalConverter.blocksToLexical(doc.content, editor)` 将 Block[] 渲染到 Lexical
- `saveDocument()`: 使用 `BlockLexicalConverter.lexicalToBlocks(editor)` 提取 Block[]，然后用 `MarkdownSerializer.serialize(blocks)` 得到 Markdown，写入 `FileSystemService.writeFile(this.filePath, markdown)`。同时更新 `Document.content` 为新 Block[]
- `getFormatState()`: `$getSelection()` + `$isRangeSelection()` 检查格式
- `getFullContent()`: `$getRoot().getTextContent()`
- 移除 `createLexicalEditor()`、`insertBlock`/`updateBlock`/`deleteBlock`
- 错误处理: 捕获 `PermissionDeniedError` 提示重新授权

### 5. platform/EditorContainer 重构

**文件**: `platform/editor/container/editor-container.ts`

- 移除 `IEditorService` 中的 `create(HTMLElement)` 方法
- `createInstance(documentId)` 调用 `createEditorService(documentId)`
- 内部 `Map<string, EditorService>` 管理实例
- 添加 `getService`/`disposeInstance`/`disposeAll`

**文件**: `features/editor/container/EditorContainer.ts` — 删除

**文件**: `features/editor/container/index.ts` — 改为 re-export platform 层

### 6. LexicalEditor 组件增强

**文件**: `components/workspace/editor/lexical-editor.tsx`

- 注册完整 Lexical 节点: ListNode, ListItemNode, HeadingNode, QuoteNode, CodeNode, CodeHighlightNode, HorizontalRuleNode
- 新增 `EditorBridgePlugin`: 获取 Lexical 实例，注入 EditorService
- 重写 `EditorContentPlugin`:
  - 监听 document prop 变化
  - 变化时使用 `BlockLexicalConverter.blocksToLexical(doc.content, editor)` 渲染
  - 防重复加载: ref 记录上次加载的 Block[] hash
- 移除现有 Block-based 简单文本加载逻辑
- 移除内联工具栏占位

### 7. ToolbarPlugin — 格式状态桥接

**新文件**: `components/workspace/editor/toolbar-plugin.tsx`

Lexical 插件组件，放在 `LexicalComposer` 内部:
- `useLexicalComposerContext()` 获取 editor
- `editor.registerUpdateListener` 监听 selection 变化
- `$isRangeSelection` 检查格式状态，更新到 store

**文件**: `components/workspace/editor/toolbar.tsx`

- 行内格式按钮调用 `editor.dispatchCommand(FORMAT_TEXT_COMMAND, format)`
- 接收 `editor: LexicalEditor` prop
- 从 store 读取 formatState 驱动高亮

**组件结构**: Toolbar 在 `LexicalComposer` 内部渲染。`editor-root.tsx` 简化为只渲染 `<ContentArea>`。

**本轮不添加块级格式按钮**（H1-H6、列表、引用）。

### 8. 编辑器快捷键

**文件**: `components/workspace/shortcut-provider.tsx`

Ctrl+S: 获取 active EditorService，调用 `saveDocument()`

### 9. AutoSaveService 接入

**文件**: `features/editor/service/AutoSaveService.ts`

- 接收 EditorService 实例
- `editor.registerUpdateListener` 监听变化 → `triggerSave()`
- debounce 2 秒后调用 `editorService.saveDocument()`
- 保存失败通过 store.setError
- 权限被撤销时暂停自动保存

### 10. 文件打开流程打通

**文件**: `components/workspace/editor/content-area.tsx`

- `openDoc.content` 已是 string（JSON 序列化的 Block[]）
- 解析: `JSON.parse(openDoc.content)` → Block[]，传给 Document

**文件**: `platform/file-open/service.ts`

- `openFile()`: 读取 Markdown → `MarkdownParser.parse(markdown)` → Block[] → 创建 Document `{ content: blocks }`
- `saveFile()`: 已有实现，接受 path + string content

**完整数据流**:
1. 用户在文件树点击文件
2. FileOpenService.readFile 读取 Markdown 文本
3. MarkdownParser.parse → Block[]
4. 创建 Document: `{ id, title, content: Block[], path }`
5. EditorTabService 创建/激活 tab
6. React 渲染，EditorBridgePlugin 注入 Lexical 实例
7. EditorContentPlugin 检测 document 变化，调用 BlockLexicalConverter.blocksToLexical 渲染

## Scope Boundaries

**In scope**:
- Inline 类型系统设计（Inline 接口 + 8 种格式标记）
- Block 内容类型更新（paragraph/heading/quote/listItem 使用 Inline[]）
- Markdown ↔ Block[] 双向转换（基于 markdown-it）
- Block[] ↔ Lexical 双向转换
- 行内格式（bold/italic/underline/strikethrough/code/highlight）
- Markdown round-trip（加载 → 编辑 → 保存）
- 自动保存（2s debounce）
- Ctrl+S 保存
- Toolbar 行内格式按钮

**Out of scope**:
- 文件监听
- 块级格式按钮（H1-H6、列表、引用）— 后续迭代
- 图片/表格/公式块的 Markdown round-trip（本轮支持基本渲染）
- 代码块语法高亮
- 搜索替换
- 嵌套块（Block.children）

## Success Criteria

- [ ] 打开 .md 文件，内容正确渲染为富文本（标题、列表、粗体、斜体、代码、引用）
- [ ] 编辑内容后 Ctrl+S 保存，文件内容正确写回磁盘
- [ ] Round-trip: 加载 → 编辑 → 保存 → 重新加载，行内格式保持一致
- [ ] Block[] 能完整表示行内格式（Inline[] 包含 bold/italic/underline 等）
- [ ] Markdown ↔ Block[] 转换正确覆盖：heading、paragraph、list、quote、code、行内格式
- [ ] Block[] ↔ Lexical 转换正确渲染行内格式到编辑器
- [ ] 自动保存在 2 秒 debounce 后触发
- [ ] Toolbar 行内格式按钮正确工作
- [ ] 选中已格式化文字时，对应 Toolbar 按钮高亮
- [ ] Ctrl+B/I/U 快捷键正常工作（Lexical 内置）
- [ ] Ctrl+S 保存当前文件
- [ ] 文件权限被撤销时显示错误提示，不崩溃
- [ ] 现有测试全部通过，新增功能有对应测试

## Open Questions

- 嵌套块（Block.children）的转换策略：本轮不处理嵌套，列表块的 ListContent.items 用平铺结构
- markdown-it 解析 inline 格式的边界情况（如嵌套 bold+italic）需实际测试
