# 富文本编辑器架构设计

> AI 原生的个人知识工作室 - 富文本编辑器子系统

**版本**: 1.0.0
**创建日期**: 2026-03-25
**状态**: 📐 设计阶段
**更新**: 2026-03-25

---

## 📋 目录

1. [产品定位](#产品定位)
2. [核心场景](#核心场景)
3. [系统架构](#系统架构)
4. [核心系统设计](#核心系统设计)
5. [数据模型](#数据模型)
6. [事件协议](#事件协议)

---

## 产品定位

### 核心价值

从「笔记工具 + AI」到「AI 驱动的知识生产流水线」。

### 产品原则

**要做**:
- 帮助 AI 获取更准确的 context
- 赋予 AI 更多与世界交互的能力

**不做**:
- 干预 AI 的动作
- 让 AI 根据 context 填空
- 告诉 AI 应该怎么做

### 用户需求

| 场景 | 描述 | 核心能力 |
|------|------|----------|
| 知识创作 | 从零开始写文章 | 流畅输入、块插入、格式切换 |
| 知识连接 | 引用其他文档 | 链接插入、引用解析、反向链接 |
| AI 协作 | 选中文字让 AI 润色 | 选区感知、上下文传递、流式响应 |
| 文件管理 | 打开/保存/切换文档 | 文件句柄、脏标记、Tab 管理 |

---

## 核心场景

### 场景 1: 知识创作

用户打开编辑器，从零开始写一篇技术文章，需要插入代码、公式、表格。

**能力需求**:
- 流畅的输入体验
- 块插入（代码、表格、公式）
- 格式切换（标题、正文、引用）
- 内容自动保存

### 场景 2: 知识连接

写作中引用其他文档，建立双向链接，形成知识网络。

**能力需求**:
- 文档搜索
- 链接插入
- 引用解析
- 反向链接

### 场景 3: AI 协作

选中一段文字，让 AI 帮忙润色、扩写、翻译或解释。

**能力需求**:
- 选区感知
- 上下文传递
- 流式响应
- 内容替换

### 场景 4: 文件管理

从文件树打开文档，编辑后保存，多文档切换。

**能力需求**:
- 文件句柄
- 读写权限
- 脏标记
- Tab 管理

---

## 系统架构

### 分层架构

```
┌─────────────────────────────────────────────────────────┐
│                   应用层 (Application)                   │
│  EditorArea │ EditorTabs │ FloatingToolbar │ AIPanel    │
├─────────────────────────────────────────────────────────┤
│                    服务层 (Services)                     │
│  EditorService │ AutoSaveService │ AIContextService     │
├─────────────────────────────────────────────────────────┤
│                   领域层 (Domain)                        │
│  Document │ Block │ BlockType │ Selection │ Operation   │
├─────────────────────────────────────────────────────────┤
│                   平台层 (Platform)                      │
│  Lexical Editor │ FileSystemService │ EventBus          │
└─────────────────────────────────────────────────────────┘
```

### 服务分层

| 层级 | 类型 | 实例模式 | 示例 |
|------|------|----------|------|
| **Registry** | 无状态服务 | 单例 | BlockRegistry, CommandRegistry |
| **Store** | 状态管理 | Zustand (多实例) | EditorStore, DocumentStore |
| **Service** | 业务服务 | 工厂创建 | EditorService, AutoSaveService |

### EditorContainer 容器模式

```
EditorContainer (全局单例)
│
├── Registry 层 (单例)
│   ├── BlockRegistry
│   └── CommandRegistry
│
└── 多实例管理 (Map<documentId, Service>)
    ├── EditorService #1 (document-001)
    │   ├── EditorStore (Zustand)
    │   ├── AutoSaveService
    │   └── AIContextService
    │
    └── EditorService #2 (document-002)
        ├── EditorStore (Zustand)
        ├── AutoSaveService
        └── AIContextService
```

---

## 核心系统设计

### 12 个核心系统总览

| 优先级 | 系统 | 职责 |
|--------|------|------|
| **P0** | DocumentModel | 文档/块的领域模型定义 |
| **P0** | BlockRegistry | 块类型注册、Node 映射 |
| **P0** | EditorService | 编辑器实例、状态管理 |
| **P0** | CommandService | 命令注册、执行、快捷键 |
| **P0** | AutoSaveService | 防抖保存、版本管理 |
| **P0** | AIContextService | 上下文协议、按需请求 |
| **P1** | HistoryService | 撤销/重做栈管理 |
| **P1** | InputRuleService | Markdown 快捷输入规则 |
| **P1** | NodeViewRegistry | Lexical Node → React 组件 |
| **P2** | ClipboardService | 复制/粘贴/拖拽处理 |
| **P2** | PerformanceOptimization | 大文档虚拟滚动、懒加载 |
| **P3** | CollaborationEngine | 未来协作基础 (CRDT/OT) |

---

### P0-1: DocumentModel (文档模型)

#### 职责

定义文档和块的领域模型，作为 Lexical 上层抽象。

#### 核心数据结构

```typescript
// 文档模型
interface Document {
  id: string;                    // nanoid + 前缀: doc-xxx
  title: string;
  blocks: Block[];
  version: number;               // MVP: 递增版本号
  createdAt: string;             // ISO 时间戳
  updatedAt: string;             // ISO 时间戳
  metadata: DocumentMetadata;
  operations?: Operation[];      // 预留给操作日志
}

// 块模型
interface Block {
  id: string;                    // nanoid + 前缀：block-xxx
  type: string;                  // 块类型标识
  content: Record<string, any>;  // 块内容 (Lexical JSON)
  children?: Block[];            // 子块（用于嵌套结构）
  metadata: BlockMetadata;
}

// 元数据
interface DocumentMetadata {
  tags?: string[];
  categories?: string[];
  [key: string]: any;
}

interface BlockMetadata {
  collapsed?: boolean;
  backgroundColor?: string;
  [key: string]: any;
}
```

#### 设计决策

| 决策点 | 选择 | 理由 |
|--------|------|------|
| ID 生成 | `nanoid()` + 前缀 | 短小、安全、可调试 |
| 内容存储 | Lexical EditorState JSON | 完整保真，可完全恢复 |
| 版本管理 | MVP: version 递增 → 未来：Operation Log | 平滑升级路径 |
| 块粒度 | 粗粒度 (Block = 语义单元) | 符合用户心智模型 |

#### 序列化格式

```json
{
  "id": "doc-001",
  "title": "未命名文档",
  "version": 1,
  "createdAt": "2026-03-25T10:00:00Z",
  "updatedAt": "2026-03-25T10:30:00Z",
  "blocks": [
    {
      "id": "block-001",
      "type": "text",
      "content": {
        "text": "这是一个标题",
        "level": 1
      },
      "metadata": {}
    },
    {
      "id": "block-002",
      "type": "code",
      "content": {
        "language": "typescript",
        "code": "console.log('Hello')"
      },
      "metadata": {}
    }
  ]
}
```

---

### P0-2: BlockRegistry (块注册中心)

#### 职责

- 注册所有块类型配置
- 管理 Block ↔ Lexical Node 的双向映射
- 作为斜杠菜单的数据源

#### 接口定义

```typescript
interface BlockTypeConfig {
  type: string;                    // 块类型标识
  name: string;                    // 人类可读名称
  category: BlockCategory;         // 分类：text/list/media
  icon: string;                    // 图标（用于菜单）
  description: string;             // 描述（用于斜杠菜单）
  defaultContent: () => JSON;      // 默认内容工厂
  toLexical: (block: Block) => Node;
  fromLexical: (node: Node) => Block;
  isValid: (content: JSON) => boolean;
  allowedChildren?: BlockType[];
}

class BlockRegistry {
  // 注册
  register(config: BlockTypeConfig): void;

  // 查询
  get(type: string): BlockTypeConfig | undefined;
  has(type: string): boolean;
  list(): BlockTypeConfig[];
  listByCategory(category: BlockCategory): BlockTypeConfig[];

  // 工厂
  createBlock(type: string, overrides?: Partial<Block>): Block;

  // 序列化
  serialize(block: Block): JSON;
  deserialize(json: JSON): Block;

  // Lexical 互转
  toLexical(block: Block): Node;
  fromLexical(node: Node): Block;
}
```

#### 块类型分类

| 分类 | 块类型 |
|------|--------|
| **文本类** | paragraph, heading (H1-H6), quote, callout |
| **列表类** | bullet-list, numbered-list, task-list |
| **媒体类** | image, code, table, equation, file-attachment |

#### 设计决策

| 决策点 | 选择 | 理由 |
|--------|------|------|
| 实例模式 | 单例 | 全局统一注册表 |
| 加载时机 | 启动注册 | 运行时查询快 |
| 扩展性 | 开放 | 支持未来插件系统 |
| 校验策略 | 严格 + 降级 | 数据完整性优先 |

---

### P0-3: EditorService (编辑器服务)

#### 职责

- Lexical Editor 实例的生命周期管理
- 文档加载、保存、内容同步
- 选区追踪、格式状态管理
- 事件分发（AI 面板、文件树）

#### 接口定义

```typescript
interface IEditorService {
  // 生命周期
  create(container: HTMLElement, options: EditorOptions): Promise<void>;
  destroy(): void;

  // 文档操作
  loadDocument(doc: DocumentModel): Promise<void>;
  saveDocument(): Promise<SaveResult>;
  getCurrentDocument(): DocumentModel | null;

  // 选区与状态
  getSelection(): SelectionState | null;
  getFormatState(): FormatState;
  canExecute(command: string): boolean;

  // 命令执行
  execute(command: string, payload?: any): boolean;

  // 事件订阅
  on<K extends keyof EditorEvents>(event: K, callback: EditorEvents[K]): Disposable;

  // 外部集成
  getAIContext(): AIContext;
  insertAIContent(content: string, options: InsertOptions): void;
}
```

#### EditorContainer

```typescript
class EditorContainer {
  private blockRegistry: BlockRegistry;
  private commandRegistry: CommandRegistry;
  private editorServices: Map<string, EditorService>;
  private stores: Map<string, EditorStoreApi>;

  constructor() {
    this.blockRegistry = new BlockRegistry();
    this.commandRegistry = new CommandRegistry();
    this.registerBuiltinBlocks();
  }

  // 创建编辑器实例
  createInstance(documentId: string): EditorService;

  // 获取实例
  getInstance(documentId: string): EditorService | null;

  // 销毁实例
  disposeInstance(documentId: string): void;

  // 获取 Store（React 订阅用）
  getStore(documentId: string): EditorStoreApi | null;
}

// 全局容器实例
export const editorContainer = new EditorContainer();
```

---

### P0-4: CommandService (命令服务)

#### 职责

- 命令注册表管理
- 命令执行与权限检查
- 快捷键绑定
- 工具栏状态同步
- 命令历史记录

#### 接口定义

```typescript
interface CommandConfig {
  name: string;                    // 命令名称（唯一标识）
  description?: string;            // 命令描述
  category: 'format' | 'insert' | 'delete' | 'transform';
  execute: (editor: LexicalEditor, payload?: any) => void | Promise<void>;
  canExecute: (editor: LexicalEditor) => boolean;
  isActive: (editor: LexicalEditor) => boolean;
  hotkey?: string | string[];      // 快捷键："Mod+B", "Ctrl+Alt+1"
  icon?: string;                   // 图标（用于工具栏/菜单）
  label?: string;                  // 标签（用于菜单显示）
}

class CommandRegistry {
  register(config: CommandConfig): void;
  unregister(name: string): void;
  get(name: string): CommandConfig | undefined;
  has(name: string): boolean;
  list(): CommandConfig[];
  listByCategory(category: CommandConfig['category']): CommandConfig[];
  execute(name: string, payload?: any): boolean;
  canExecute(name: string): boolean;
  isActive(name: string): boolean;
}
```

#### 内置命令清单

| 命令 | 快捷键 | 分类 | 描述 |
|------|--------|------|------|
| `bold` | Mod+B | format | 加粗 |
| `italic` | Mod+I | format | 斜体 |
| `underline` | Mod+U | format | 下划线 |
| `strikethrough` | Mod+Shift+S | format | 删除线 |
| `code` | Mod+E | format | 行内代码 |
| `heading1` | Ctrl+Alt+1 | transform | H1 标题 |
| `heading2` | Ctrl+Alt+2 | transform | H2 标题 |
| `paragraph` | Ctrl+Alt+0 | transform | 段落 |
| `bullet-list` | Ctrl+Shift+8 | transform | 无序列表 |
| `numbered-list` | Ctrl+Shift+7 | transform | 有序列表 |
| `quote` | Ctrl+Shift+9 | transform | 引用块 |
| `insert-code-block` | - | insert | 插入代码块 |
| `insert-table` | - | insert | 插入表格 |
| `insert-image` | - | insert | 插入图片 |
| `insert-equation` | - | insert | 插入公式 |
| `undo` | Mod+Z | format | 撤销 |
| `redo` | Mod+Shift+Z | format | 重做 |

#### 快捷键系统

- `Mod` = Ctrl (Windows) / Cmd (Mac)
- 支持组合键：`Ctrl+Alt+1`, `Ctrl+Shift+8`
- 快捷键冲突解决：后注册的覆盖先注册的

---

### P0-5: AutoSaveService (自动保存服务)

#### 职责

- 防抖保存（debounce，默认 1000ms）
- 版本管理（递增 version）
- 冲突检测（检测文件被外部修改）
- 错误恢复（重试机制）
- 本地缓存（崩溃恢复）

#### 接口定义

```typescript
enum SaveState {
  IDLE = 'idle',        // 空闲
  PENDING = 'pending',  // 等待保存（防抖中）
  SAVING = 'saving',    // 保存中
  SAVED = 'saved',      // 已保存
  ERROR = 'error'       // 保存失败
}

interface SaveResult {
  success: boolean;
  version?: number;
  error?: Error;
  timestamp: string;
}

class AutoSaveService {
  constructor(
    store: EditorStoreApi,
    fileSystemService: FileSystemService,
    blockRegistry: BlockRegistry
  );

  // 启用自动保存
  enable(documentId: string): void;

  // 禁用自动保存
  disable(documentId: string): void;

  // 内容变化时调用（触发防抖）
  onContentChange(documentId: string): void;

  // 手动保存
  save(documentId: string): Promise<SaveResult>;

  // 获取保存状态
  getSaveState(documentId: string): SaveState;

  // 订阅保存状态变化
  subscribe(callback: (state: SaveState) => void): Disposable;

  // 获取本地缓存（崩溃恢复用）
  getLocalCache(documentId: string): Promise<DocumentModel | null>;

  // 清除本地缓存
  clearCache(documentId: string): void;
}
```

#### 保存流程

```
用户输入 → onContentChange() → 取消旧的 timer → 设置 PENDING → 启动新 timer (1 秒)
                                                         ↓
                                               timer 触发 → save()
                                                         ↓
                                               序列化文档 → 写入文件
                                                         ↓
                                               设置 SAVED → 清除缓存 → 发送 saved 事件
```

#### 冲突检测

```typescript
async function checkConflict(documentId: string): Promise<boolean> {
  const remoteDoc = await fileSystemService.read(documentId);
  const localVersion = store.getVersion(documentId);

  // 如果远程版本 > 本地版本，说明文件被外部修改
  return remoteDoc.version > localVersion;
}
```

---

### P0-6: AIContextService (AI 上下文服务)

#### 职责

- AI 上下文收集（文档信息、选区、全文）
- 按需请求（AI 面板主动请求时才传递）
- 事件推送（选区变化时可选推送）
- AI 响应处理
- 内容插入/替换

#### 接口定义

```typescript
interface AIContext {
  // 文档信息
  document: {
    id: string;
    path: string;
    title: string;
    type: string;
  };

  // 选区信息
  selection: {
    text: string;
    from: Position;
    to: Position;
    length: number;
  } | null;

  // 全文内容（按需）
  fullContent: string | null;

  // 光标位置
  cursorPosition: Position | null;

  // 当前格式状态
  formatState: FormatState | null;
}

type AIMode = 'chat' | 'edit' | 'expand' | 'summarize' | 'translate';

interface AIRequest {
  prompt: string;
  context: AIContext;
  mode: AIMode;
  options?: {
    language?: string;       // 翻译目标语言
    tone?: 'formal' | 'casual';
    maxLength?: number;
  };
}

interface AIResponse {
  id: string;
  content: string;
  type: 'text' | 'code' | 'markdown';
  timestamp: string;
  metadata?: {
    model?: string;
    tokens?: number;
  };
}

type InsertMode = 'replace' | 'append' | 'prepend' | 'new-block';

class AIContextService {
  constructor(
    store: EditorStoreApi,
    blockRegistry: BlockRegistry
  );

  // 获取 AI 上下文（按需）
  getContext(options?: { includeFullContent?: boolean }): AIContext;

  // 订阅上下文变化
  subscribe(callback: (context: AIContext) => void): Disposable;

  // 请求 AI（调用外部 API）
  requestAI(request: AIRequest): Promise<AIResponse>;

  // 插入 AI 内容
  insertContent(content: string, mode: InsertMode): void;

  // 替换选区内容
  replaceSelection(content: string): void;
}
```

#### AI 交互流程

```
1. 用户选中文本
2. EditorService 发送 selection:changed 事件
3. AIPanel 接收事件，显示选区信息
4. 用户输入 prompt（如"润色这段文字"）
5. AIPanel 调用 AIContextService.getContext()
6. AIPanel 发送 AIRequest 到后端
7. 接收 AIResponse
8. 调用 AIContextService.insertContent() 插入结果
9. EditorService 更新编辑器内容
```

#### AI 模式

| 模式 | 描述 | 示例 |
|------|------|------|
| `chat` | 对话模式，回答问题 | "解释一下这段代码" |
| `edit` | 编辑模式，修改选区 | "润色这段文字" |
| `expand` | 扩写模式，补充内容 | "展开讲讲这个观点" |
| `summarize` | 总结模式，概括大意 | "总结这段内容" |
| `translate` | 翻译模式 | "翻译成英文" |

---

## 数据模型

### 类型定义总览

```typescript
// 块类型枚举
type BlockCategory = 'text' | 'list' | 'media';

type BlockType =
  | 'paragraph'
  | 'heading'
  | 'quote'
  | 'bullet-list'
  | 'numbered-list'
  | 'task-list'
  | 'code'
  | 'table'
  | 'image'
  | 'equation';

// 选区状态
interface SelectionState {
  text: string;
  from: Position;
  to: Position;
  format: FormatState;
}

interface Position {
  blockId: string;
  offset: number;
}

// 格式状态
interface FormatState {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  code: boolean;
  headingLevel: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  listType: 'none' | 'bullet' | 'number' | 'task';
}
```

---

## 事件协议

### 编辑器事件

```typescript
interface EditorEvents {
  // 文档事件
  'document:loaded': (doc: DocumentModel) => void;
  'document:saved': (result: SaveResult) => void;
  'document:closed': () => void;

  // 选区事件
  'selection:changed': (selection: SelectionState) => void;
  'format:changed': (format: FormatState) => void;

  // 内容事件
  'content:changed': (content: string) => void;
  'content:dirty': () => void;
  'content:clean': () => void;

  // AI 事件
  'ai:request': (context: AIContext) => void;
  'ai:response': (response: AIResponse) => void;
  'ai:insert': (content: string) => void;

  // 错误事件
  'error': (error: EditorError) => void;
}
```

### 事件通信流程

```
┌─────────────┐      ┌─────────────┐      ┌─────────────┐
│  Editor     │      │  EventBus   │      │  AIPanel    │
│  Service    │      │             │      │             │
└──────┬──────┘      └──────┬──────┘      └──────┬──────┘
       │                    │                    │
       │ selection:changed  │                    │
       │───────────────────>│                    │
       │                    │                    │
       │                    │  (AI 面板订阅)      │
       │                    │───────────────────>│
       │                    │                    │
       │                    │   ai:request       │
       │                    │<───────────────────│
       │                    │                    │
       │ getAIContext()     │                    │
       │───────────────────>│                    │
       │                    │                    │
       │<───────────────────│                    │
       │ AIContext          │                    │
       │                    │                    │
```

---

## 扩展系统设计

### P1-1: HistoryService (撤销/重做管理器)

#### 职责

- 维护 undo/redo 两个操作栈
- 支持批量操作（将多个操作打包为一组）
- 限制历史栈大小（默认 100 条）
- 与自动保存协同（保存后不清空历史栈）

#### 接口定义

```typescript
interface Operation {
  id: string;
  type: 'insert' | 'delete' | 'update' | 'transform';
  blockId: string;
  data: any;
  timestamp: number;
  batchId?: string;  // 批量操作 ID
}

class HistoryService {
  constructor(private editor: LexicalEditor);

  // 记录操作
  record(operation: Operation): void;

  // 开始批量操作
  startBatch(): string;

  // 结束批量操作
  endBatch(): void;

  // 撤销
  undo(): boolean;

  // 重做
  redo(): boolean;

  // 清空历史
  clear(): void;

  // 是否可撤销
  canUndo(): boolean;

  // 是否可重做
  canRedo(): boolean;
}
```

---

### P1-2: InputRuleService (Markdown 快捷输入规则)

#### 职责

- 检测用户输入的触发文本
- 自动将 Markdown 语法转换为对应块类型
- 支持行内格式（**加粗** *斜体*）
- 支持块转换（# 标题 → HeadingBlock）
- 规则注册与优先级管理

#### 接口定义

```typescript
interface InputRule {
  name: string;
  triggers: string[];        // 触发文本
  type: 'inline' | 'block';  // 规则类型
  pattern?: RegExp;          // 正则匹配
  transform: (match: RegExpMatchArray, text: string) => void;
  priority?: number;         // 优先级（数字越大越高）
}

class InputRuleService {
  // 注册规则
  register(rule: InputRule): void;

  // 处理输入
  handleInput(text: string, position: number): boolean;

  // 清空规则
  clear(): void;
}
```

#### 内置 Markdown 规则

| 触发 | 转换结果 | 类型 |
|------|----------|------|
| `# ` | H1 标题 | block |
| `## ` | H2 标题 | block |
| `- ` | 无序列表 | block |
| `1. ` | 有序列表 | block |
| `> ` | 引用块 | block |
| ` ``` ` | 代码块 | block |
| `**text**` | 加粗 | inline |
| `*text*` | 斜体 | inline |
| `` `code` `` | 行内代码 | inline |

---

### P1-3: NodeViewRegistry (节点视图注册中心)

#### 职责

- 管理 Lexical Node → React 组件的映射
- 处理复杂块（代码块、表格、图片）的视图渲染
- 支持自定义节点视图

#### 接口定义

```typescript
interface NodeViewConfig {
  nodeType: string;  // Lexical Node 类型
  component: React.ComponentType<NodeViewProps>;
  props?: Record<string, any>;
}

class NodeViewRegistry {
  // 注册节点视图
  register(config: NodeViewConfig): void;

  // 获取组件
  getComponent(nodeType: string): React.ComponentType | null;

  // 渲染节点
  render(node: Node, props: NodeViewProps): React.ReactNode;
}
```

---

## 实施路线图

### Phase 1: MVP（当前阶段）

**目标**: 实现核心编辑功能

- [ ] DocumentModel - 文档模型定义
- [ ] BlockRegistry - 块类型注册（文本、标题、列表）
- [ ] EditorService - 编辑器实例管理
- [ ] EditorContainer - 容器/工厂
- [ ] 基础 UI 组件（EditorArea, EditorTabs）

### Phase 2: 增强

**目标**: 完善编辑体验

- [ ] CommandService - 命令系统
- [ ] AutoSaveService - 自动保存
- [ ] AIContextService - AI 上下文
- [ ] InputRuleService - Markdown 快捷输入
- [ ] FloatingToolbar - 浮动工具栏

### Phase 3: 高级功能

**目标**: 专业编辑体验

- [ ] HistoryService - 撤销/重做
- [ ] ClipboardService - 剪贴板
- [ ] NodeViewRegistry - 节点视图
- [ ] PerformanceOptimization - 性能优化
- [ ] SlashMenu - 斜杠菜单

---

**相关文档**:
- [工作视图主文档](./workspace-view.md)
- [文件系统架构](../architecture/file-system-architecture.md)
- [AI 面板模块](./ai-panel.md)
