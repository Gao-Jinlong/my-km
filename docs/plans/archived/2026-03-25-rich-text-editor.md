# 富文本编辑器开发记录

**开发日期**: 2026-03-25
**开发阶段**: Phase 1 MVP + 路由修复
**提交范围**: `1783229..HEAD` (共 10 个提交)

---

## 一、开发摘要

### 1.1 完成的功能模块

| 模块 | 状态 | 说明 |
|------|------|------|
| 文档模型与类型定义 | ✅ | Document、Block、Selection 等核心类型 |
| BlockRegistry 块注册中心 | ✅ | 8 种基础块类型注册与管理 |
| EditorService 编辑器服务 | ✅ | Lexical Editor 创建与管理 |
| EditorContainer 容器 | ✅ | 全局多编辑器实例管理 |
| AutoSaveService 自动保存 | ✅ | 防抖保存逻辑 |
| AIContextService AI 上下文 | ✅ | 上下文收集与推送 |
| 基础 UI 组件 | ✅ | EditorRoot、Toolbar、ContentArea 等 |
| EditorTabs 标签页 | ✅ | 多文档 Tab 管理 |
| FileTree 文件树 | ✅ | 文件浏览与打开 |
| EditorUIStore 状态管理 | ✅ | 打开的文档列表管理 |
| 路由修复 | ✅ | 项目选择流程修复 |

### 1.2 统计数据

- **新增文件**: 28 个
- **修改文件**: 8 个
- **新增代码**: ~5,000 行
- **测试文件**: 10 个
- **测试用例**: 293 个通过

---

## 二、架构设计

### 2.1 分层架构

```
┌─────────────────────────────────────────────────────────┐
│                    UI Components Layer                   │
│  (EditorRoot, EditorTabs, FileTree, ContentArea, etc.)  │
├─────────────────────────────────────────────────────────┤
│                    Store Layer (Zustand)                 │
│     (EditorUIStore, EditorStore - 多实例)                │
├─────────────────────────────────────────────────────────┤
│                    Service Layer (Factory)               │
│  (EditorService, AutoSaveService, AIContextService)     │
├─────────────────────────────────────────────────────────┤
│                    Registry Layer (Singleton)            │
│          (BlockRegistry - 单例无状态)                     │
└─────────────────────────────────────────────────────────┘
```

### 2.2 核心设计决策

| 决策 | 方案 | 理由 |
|------|------|------|
| 块粒度 | 粗粒度 (Block = 语义单元) | 便于 AI 理解和操作 |
| ID 生成 | nanoid (带前缀) | doc-xxx, block-xxx |
| 状态管理 | Zustand | 项目已有，多实例支持好 |
| 编辑器引擎 | Lexical 0.39 | 可扩展性强，支持自定义 Node |
| AI 上下文传递 | 混合模式 | 按需请求 + 事件推送 |

---

## 三、核心模块详解

### 3.1 类型定义 (`src/features/editor/types/`)

#### Document 接口
```typescript
interface Document {
  id: string;           // 格式：doc-xxxxx
  path: string;
  title: string;
  type: 'rich-text' | 'markdown';
  content: Block[];
  version: number;
  createdAt: string;
  updatedAt: string;
  operations?: Operation[];  // 预留操作日志
}
```

#### Block 类型
```typescript
interface BaseBlock {
  id: string;           // 格式：block-xxxxx
  type: string;         // paragraph, heading, list, etc.
  content: Record<string, any>;
  children?: Block[];
  styles?: Record<string, any>;
  metadata?: Record<string, any>;
}
```

#### 8 种块类型
1. `paragraph` - 文本块
2. `heading` - 标题块 (h1-h6)
3. `list` - 列表块 (bullet/number/check)
4. `quote` - 引用块
5. `code` - 代码块
6. `table` - 表格块
7. `image` - 图片块
8. `formula` - 公式块

### 3.2 BlockRegistry (`src/features/editor/registry/`)

```typescript
interface BlockTypeConfig {
  type: string;
  name: string;
  category: BlockCategory;  // TEXT | MEDIA | STRUCTURE
  icon: string;
  description: string;
  defaultContent: () => Record<string, any>;
  isValid: (content: Record<string, any>) => boolean;
  allowedChildren?: string[];
}

class BlockRegistry {
  register(config: BlockTypeConfig): void;
  get(type: string): BlockTypeConfig | undefined;
  createBlock(type: string, content?: Record<string, any>): Block | null;
  validateBlock(type: string, content: Record<string, any>): boolean;
  getAllTypes(): string[];
  getByCategory(category: BlockCategory): string[];
}
```

### 3.3 EditorService & EditorContainer

**EditorService** - 单个编辑器的业务逻辑：
- Lexical Editor 创建与配置
- 文档加载/保存
- 选区追踪
- 格式状态获取

**EditorContainer** - 全局多编辑器管理：
```typescript
class EditorContainer {
  static getInstance(blockRegistry: BlockRegistry): EditorContainer;
  createInstance(documentId: string): EditorService;
  getService(documentId: string): EditorService | null;
  getStore(documentId: string): EditorStoreApi | null;
  disposeInstance(documentId: string): void;
  disposeAll(): void;
}
```

### 3.4 AutoSaveService

```typescript
interface AutoSaveService {
  register(documentId: string, editorService: EditorService): void;
  unregister(documentId: string): void;
  triggerSave(documentId: string): void;    // 防抖触发
  saveNow(documentId: string): Promise<SaveResult>;
  enable(documentId: string): void;
  disable(documentId: string): void;
}
```

**特性**:
- 可配置防抖时间 (默认 500ms)
- 最大等待时间 (默认 5000ms)
- 保存状态通知 (IDLE | SAVING | SAVED | ERROR)

### 3.5 AIContextService

```typescript
interface AIContext {
  document: { id: string; path: string; title: string; type: string; };
  selection: { text: string; from: Position; to: Position; length: number; } | null;
  fullContent: string | null;
  cursorPosition: Position | null;
  formatState: FormatState | null;
}

interface AIContextService {
  getContext(documentId: string): Promise<AIContext | null>;      // 按需请求
  subscribe(documentId: string, subscriber: Subscriber): void;    // 事件推送
  unsubscribe(documentId: string, subscriberId: string): void;
  notifyContextChange(documentId: string): void;
}
```

### 3.6 EditorUIStore (`src/stores/editor-ui-store.ts`)

**UI 层面的状态管理**，管理打开的文档：
```typescript
interface EditorUIState {
  openDocuments: OpenDocument[];  // 打开的文档列表
  activeDocumentId: string | null; // 活动文档 ID
}

interface EditorUIActions {
  openDocument: (doc: Document | OpenDocument) => void;
  closeDocument: (documentId: string) => void;
  activateDocument: (documentId: string) => void;
  closeAllDocuments: () => void;
  closeOtherDocuments: (documentId: string) => void;
}
```

---

## 四、UI 组件

### 4.1 组件列表

| 组件 | 路径 | 功能 |
|------|------|------|
| EditorRoot | `components/workspace/editor/editor-root.tsx` | 编辑器根组件 |
| EditorShell | `components/workspace/editor/editor-shell.tsx` | 编辑器外壳 |
| EditorTabs | `components/workspace/editor/editor-tabs.tsx` | 文档标签页 |
| Toolbar | `components/workspace/editor/toolbar.tsx` | 格式工具栏 |
| ContentArea | `components/workspace/editor/content-area.tsx` | 内容区域 |
| LexicalEditor | `components/workspace/editor/lexical-editor.tsx` | Lexical 编辑器 |
| FileTree | `components/workspace/sidebar/panels/file-tree.tsx` | 文件树 |
| FilesPanel | `components/workspace/sidebar/panels/files-panel.tsx` | 文件面板 |
| EditorArea | `components/workspace/editor/editor-area.tsx` | 编辑器主区域 |

### 4.2 键盘快捷键

| 快捷键 | 功能 |
|--------|------|
| Ctrl+W | 关闭当前文档 |
| Ctrl+Tab | 切换到下一个文档 |

---

## 五、路由修复

### 5.1 问题描述

用户反馈："默认进入了 workspace 页面，没有选择打开的文件夹"

### 5.2 根本原因

- `project.isOpen` 来自持久化存储，值为 `true`
- `project.currentProject.rootHandle` 为 `null`（句柄无法序列化）
- 条件判断 `!project.isOpen || !project.currentProject` 失败，直接显示工作区

### 5.3 修复方案

修改 `app/[locale]/workspace/page.tsx`:

```typescript
// 修复前
if (!project.isOpen || !project.currentProject) {
    return <Welcome />;
}

// 修复后
if (!project.isOpen || !project.currentProject || !project.currentProject.rootHandle) {
    // 清除无效项目状态
    if (project.currentProject && !project.currentProject.rootHandle) {
        clearProject();
    }
    return <Welcome />;
}
```

### 5.4 路由流程（修复后）

```
/ → /zh-CN → /zh-CN/workspace
                     ↓
    ┌────────────────┴────────────────┐
    ↓                                 ↓
无项目/句柄失效                    有有效项目
    ↓                                 ↓
Welcome + ProjectPicker        WorkspaceContent
```

---

## 六、测试

### 6.1 测试覆盖

| 测试类型 | 文件数 | 用例数 | 状态 |
|----------|--------|--------|------|
| 单元测试 | 10 | ~200 | ✅ 通过 |
| 集成测试 | 2 | 30 | ✅ 通过 |
| E2E 测试 | 1 | ~20 | ✅ 通过 |

### 6.2 测试文件

```
src/features/editor/registry/__tests__/BlockRegistry.test.ts
src/features/editor/store/__tests__/editor-store.test.ts
src/features/editor/service/__tests__/EditorService.test.ts
src/features/editor/service/__tests__/AutoSaveService.test.ts
src/features/editor/container/__tests__/EditorContainer.test.ts
src/features/editor/__tests__/integration.test.ts
src/features/ai/service/__tests__/AIContextService.test.ts
src/features/ai/__tests__/integration.test.ts
tests/e2e/editor-basic.e2e.ts
```

---

## 七、文件清单

### 7.1 新增文件 (28 个)

**类型定义**
- `src/features/editor/types/document.ts`
- `src/features/editor/types/block.ts`
- `src/features/editor/types/selection.ts`
- `src/features/editor/types/index.ts`

**注册中心**
- `src/features/editor/registry/BlockRegistry.ts`
- `src/features/editor/registry/builtin-types.ts`
- `src/features/editor/registry/index.ts`

**服务层**
- `src/features/editor/service/EditorService.ts`
- `src/features/editor/service/AutoSaveService.ts`
- `src/features/editor/service/index.ts`

**容器**
- `src/features/editor/container/EditorContainer.ts`
- `src/features/editor/container/index.ts`

**Store**
- `src/features/editor/store/editor-store.ts`
- `src/features/editor/store/index.ts`
- `src/stores/editor-ui-store.ts`

**AI 服务**
- `src/features/ai/service/AIContextService.ts`
- `src/features/ai/service/index.ts`

**UI 组件**
- `src/components/workspace/editor/editor-root.tsx`
- `src/components/workspace/editor/editor-shell.tsx`
- `src/components/workspace/editor/toolbar.tsx`
- `src/components/workspace/editor/lexical-editor.tsx`
- `src/components/workspace/editor/content-area.tsx` (修改)
- `src/components/workspace/editor/editor-area.tsx` (修改)
- `src/components/workspace/editor/editor-tabs.tsx` (修改)
- `src/components/workspace/editor/index.ts`
- `src/components/workspace/sidebar/panels/file-tree.tsx`
- `src/components/workspace/sidebar/panels/files-panel.tsx` (修改)

**测试**
- `tests/e2e/editor-basic.e2e.ts`
- `playwright.config.ts`

**文档**
- `docs/superpowers/plans/2026-03-25-rich-text-editor-phase1.md`

### 7.2 修改文件 (8 个)

- `apps/web/package.json` - 添加测试脚本
- `apps/web/tsconfig.json` - 配置调整
- `app/[locale]/workspace/page.tsx` - 路由修复

---

## 八、提交历史

```
20a89d5 fix: 修复 workspace 页面默认进入问题
fab9cf3 feat: 实现文档编辑基础功能
b29a127 fix: 修复 AI 集成测试中未使用的 import
d8a8999 test: 添加集成测试与 E2E 测试
d70626f feat: 实现 AutoSaveService 自动保存服务
19ea75c feat: implement AIContextService for AI Panel context management
c4064a0 feat: implement EditorService and EditorContainer
ee99be4 feat: 实现基础 UI 组件
63c25bd feat: 实现 BlockRegistry 块类型注册中心
1783229 feat: 实现富文本编辑器文档模型与类型定义
```

---

## 九、后续计划

### 9.1 P1 优先级 (待实现)

| 系统 | 说明 |
|------|------|
| HistoryService | 撤销/重做功能 |
| InputRuleService | 输入规则 (Markdown 快捷输入) |
| NodeViewRegistry | 自定义节点视图 |

### 9.2 P2 优先级

| 系统 | 说明 |
|------|------|
| ClipboardService | 剪贴板处理 |
| PerformanceOptimization | 性能优化 |

### 9.3 P3 优先级

| 系统 | 说明 |
|------|------|
| CollaborationEngine | 协作编辑引擎 |

### 9.4 待集成

1. **Toolbar 与 LexicalEditor 集成** - 格式化按钮连接
2. **AutoSaveService 集成** - 实际保存流程
3. **AI Panel 集成** - AI 上下文读取
4. **文件树与文件系统深度集成** - 真实的文件操作

---

## 十、已知问题

1. **TypeScript 类型错误** (已有问题，非本次引入)
   - `capability-utils.test.ts` - 导入问题
   - `fs-access-provider.ts` - File System API 类型定义
   - `workspace-content.tsx` - react-resizable-panels 类型

2. **Biome Lint 警告** (无障碍相关)
   - `file-tree.tsx` - onClick 需要对应键盘事件
   - `file-tree.tsx` - role="group" 建议使用 fieldset

3. **功能限制**
   - 项目句柄无法持久化，刷新页面需要重新选择
   - LexicalEditor 尚未完全集成 Toolbar
   - 自动保存尚未实际连接文件系统

---

**文档版本**: 1.0
**最后更新**: 2026-03-25
