# 富文本编辑器 (Phase 1: MVP) 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现富文本编辑器的核心功能，包括文档模型、块注册中心、编辑器服务容器，以及基础 UI 组件

**Architecture:** 采用分层架构：Registry 层（单例无状态）→ Store 层（Zustand 多实例）→ Service 层（工厂创建）。EditorContainer 管理多编辑器实例，BlockRegistry 管理块类型与 Lexical Node 的映射。

**Tech Stack:** Next.js 16, React 19, Lexical 0.39, Zustand, TypeScript, Vitest

**Spec Document:** [editor-architecture.md](./editor-architecture.md)

---

## 文件结构总览

### 新增目录结构

```
apps/web/src/
└── platform/
    └── editor/                    # 新增：编辑器平台层
        ├── container/
        │   ├── editor-container.ts      # 编辑器容器（单例）
        │   └── index.ts
        ├── registries/
        │   ├── block-registry.ts        # 块类型注册中心
        │   ├── block-configs/           # 块类型配置
        │   │   ├── text-block.ts
        │   │   ├── heading-block.ts
        │   │   ├── list-block.ts
        │   │   ├── code-block.ts
        │   │   ├── table-block.ts
        │   │   ├── image-block.ts
        │   │   └── equation-block.ts
        │   └── index.ts
        ├── stores/
        │   ├── editor-store.ts          # 编辑器状态 (Zustand)
        │   ├── document-store.ts        # 文档状态
        │   └── index.ts
        ├── services/
        │   ├── editor-service.ts        # 编辑器服务
        │   ├── autosave-service.ts      # 自动保存服务
        │   ├── ai-context-service.ts    # AI 上下文服务
        │   └── index.ts
        ├── models/
        │   ├── document-model.ts        # 文档模型定义
        │   ├── types.ts                 # 类型定义
        │   └── index.ts
        └── index.ts                     # 统一导出

apps/web/src/
└── components/
    └── workspace/
        └── editor/
            ├── editor-root.tsx          # 编辑器根组件 (新增)
            ├── editor-area.tsx          # 编辑区域 (修改)
            ├── editor-tabs.tsx          # Tab 栏 (修改)
            ├── toolbar/
            │   ├── floating-toolbar.tsx # 浮动工具栏
            │   └── index.ts
            └── hooks/
                └── use-editor.ts        # 编辑器 Hook
```

---

## Task 1: 文档模型与类型定义

**Files:**
- Create: `apps/web/src/platform/editor/models/types.ts`
- Create: `apps/web/src/platform/editor/models/document-model.ts`
- Create: `apps/web/src/platform/editor/models/index.ts`
- Test: `apps/web/src/platform/editor/models/__tests__/document-model.test.ts`

---

### Task 1.1: 定义核心类型

- [ ] **Step 1: 创建类型定义文件**

创建 `apps/web/src/platform/editor/models/types.ts`：

```typescript
import type { EditorState, SerializedEditorState } from 'lexical';

// 块类型枚举
export type BlockCategory = 'text' | 'list' | 'media';

export type BlockType =
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

// 位置定义
export interface Position {
  blockId: string;
  offset: number;
}

// 选区状态
export interface SelectionState {
  text: string;
  from: Position;
  to: Position;
  format: FormatState;
}

// 格式状态
export interface FormatState {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  code: boolean;
  headingLevel: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  listType: 'none' | 'bullet' | 'number' | 'task';
}

// 文档元数据
export interface DocumentMetadata {
  tags?: string[];
  categories?: string[];
  [key: string]: any;
}

// 块元数据
export interface BlockMetadata {
  collapsed?: boolean;
  backgroundColor?: string;
  [key: string]: any;
}

// 块模型
export interface Block {
  id: string;
  type: BlockType;
  content: Record<string, any>;  // Lexical EditorState JSON
  children?: Block[];
  metadata: BlockMetadata;
}

// 文档模型
export interface DocumentModel {
  id: string;
  title: string;
  blocks: Block[];
  version: number;
  createdAt: string;
  updatedAt: string;
  metadata: DocumentMetadata;
  operations?: Operation[];  // 预留给操作日志
}

// 操作模型 (用于未来操作日志)
export interface Operation {
  id: string;
  type: 'insert' | 'delete' | 'update' | 'transform';
  blockId: string;
  data: any;
  timestamp: number;
  batchId?: string;
}

// 保存结果
export interface SaveResult {
  success: boolean;
  version?: number;
  error?: Error;
  timestamp: string;
}

// 保存状态枚举
export enum SaveState {
  IDLE = 'idle',
  PENDING = 'pending',
  SAVING = 'saving',
  SAVED = 'saved',
  ERROR = 'error',
}
```

- [ ] **Step 2: 运行类型检查**

```bash
cd apps/web && npx tsc --noEmit
```

预期：无类型错误

- [ ] **Step 3: 提交**

```bash
git add apps/web/src/platform/editor/models/types.ts
git commit -m "feat(editor): add core type definitions for document model"
```

---

### Task 1.2: 文档模型序列化/反序列化

- [ ] **Step 1: 创建文档模型工具函数**

创建 `apps/web/src/platform/editor/models/document-model.ts`：

```typescript
import { nanoid } from 'nanoid';
import type { DocumentModel, Block, BlockType } from './types';

/**
 * 生成文档 ID
 */
export function generateDocumentId(): string {
  return `doc-${nanoid()}`;
}

/**
 * 生成块 ID
 */
export function generateBlockId(): string {
  return `block-${nanoid()}`;
}

/**
 * 创建空文档
 */
export function createEmptyDocument(title: string = '未命名文档'): DocumentModel {
  const now = new Date().toISOString();
  return {
    id: generateDocumentId(),
    title,
    blocks: [],
    version: 1,
    createdAt: now,
    updatedAt: now,
    metadata: {},
  };
}

/**
 * 创建块
 */
export function createBlock(
  type: BlockType,
  content: Record<string, any> = {},
  metadata = {}
): Block {
  return {
    id: generateBlockId(),
    type,
    content,
    metadata,
  };
}

/**
 * 序列化文档为 JSON
 */
export function serializeDocument(doc: DocumentModel): string {
  return JSON.stringify(doc, null, 2);
}

/**
 * 从 JSON 反序列化文档
 */
export function deserializeDocument(json: string): DocumentModel {
  const data = JSON.parse(json);

  // 基本校验
  if (!data.id || !data.title || !Array.isArray(data.blocks)) {
    throw new Error('Invalid document format');
  }

  return data as DocumentModel;
}

/**
 * 递增文档版本
 */
export function incrementVersion(doc: DocumentModel): DocumentModel {
  return {
    ...doc,
    version: doc.version + 1,
    updatedAt: new Date().toISOString(),
  };
}
```

- [ ] **Step 2: 创建模块入口**

创建 `apps/web/src/platform/editor/models/index.ts`：

```typescript
export * from './types';
export * from './document-model';
```

- [ ] **Step 3: 创建测试文件**

创建 `apps/web/src/platform/editor/models/__tests__/document-model.test.ts`：

```typescript
import { describe, it, expect } from 'vitest';
import {
  generateDocumentId,
  generateBlockId,
  createEmptyDocument,
  createBlock,
  serializeDocument,
  deserializeDocument,
  incrementVersion,
} from '../document-model';
import type { BlockType } from '../types';

describe('document-model', () => {
  describe('generateDocumentId', () => {
    it('should generate unique IDs with doc- prefix', () => {
      const id1 = generateDocumentId();
      const id2 = generateDocumentId();

      expect(id1).toMatch(/^doc-/);
      expect(id2).toMatch(/^doc-/);
      expect(id1).not.toBe(id2);
    });
  });

  describe('generateBlockId', () => {
    it('should generate unique IDs with block- prefix', () => {
      const id1 = generateBlockId();
      const id2 = generateBlockId();

      expect(id1).toMatch(/^block-/);
      expect(id2).toMatch(/^block-/);
      expect(id1).not.toBe(id2);
    });
  });

  describe('createEmptyDocument', () => {
    it('should create document with default title', () => {
      const doc = createEmptyDocument();

      expect(doc.id).toMatch(/^doc-/);
      expect(doc.title).toBe('未命名文档');
      expect(doc.blocks).toEqual([]);
      expect(doc.version).toBe(1);
    });

    it('should create document with custom title', () => {
      const doc = createEmptyDocument('My Document');

      expect(doc.title).toBe('My Document');
    });
  });

  describe('createBlock', () => {
    it('should create a text block', () => {
      const block = createBlock('paragraph', { text: 'Hello' });

      expect(block.id).toMatch(/^block-/);
      expect(block.type).toBe('paragraph');
      expect(block.content).toEqual({ text: 'Hello' });
    });

    it('should create block with metadata', () => {
      const block = createBlock('heading', { text: 'Title', level: 1 }, { collapsed: true });

      expect(block.type).toBe('heading');
      expect(block.metadata.collapsed).toBe(true);
    });
  });

  describe('serializeDocument and deserializeDocument', () => {
    it('should serialize and deserialize document correctly', () => {
      const originalDoc = createEmptyDocument('Test Doc');
      originalDoc.blocks.push(createBlock('paragraph', { text: 'Content' }));

      const serialized = serializeDocument(originalDoc);
      const deserialized = deserializeDocument(serialized);

      expect(deserialized.id).toBe(originalDoc.id);
      expect(deserialized.title).toBe(originalDoc.title);
      expect(deserialized.blocks.length).toBe(1);
      expect(deserialized.blocks[0].type).toBe('paragraph');
    });

    it('should throw error for invalid format', () => {
      expect(() => deserializeDocument('{}')).toThrow('Invalid document format');
      expect(() => deserializeDocument('{"id": "1"}')).toThrow('Invalid document format');
    });
  });

  describe('incrementVersion', () => {
    it('should increment version and update timestamp', () => {
      const doc = createEmptyDocument();
      const oldVersion = doc.version;
      const oldUpdatedAt = doc.updatedAt;

      const newDoc = incrementVersion(doc);

      expect(newDoc.version).toBe(oldVersion + 1);
      expect(newDoc.updatedAt).not.toBe(oldUpdatedAt);
      expect(newDoc.id).toBe(doc.id);  // ID should not change
    });
  });
});
```

- [ ] **Step 4: 运行测试**

```bash
cd apps/web && npm run test -- --run src/platform/editor/models/__tests__/document-model.test.ts
```

预期：所有测试通过

- [ ] **Step 5: 提交**

```bash
git add apps/web/src/platform/editor/models/
git commit -m "feat(editor): implement document model with serialization"
```

---

## Task 2: BlockRegistry (块类型注册中心)

**Files:**
- Create: `apps/web/src/platform/editor/registries/block-registry.ts`
- Create: `apps/web/src/platform/editor/registries/block-configs/*.ts`
- Create: `apps/web/src/platform/editor/registries/index.ts`
- Test: `apps/web/src/platform/editor/registries/__tests__/block-registry.test.ts`

---

### Task 2.1: 定义块类型配置接口

- [ ] **Step 1: 创建块类型配置接口**

创建 `apps/web/src/platform/editor/registries/block-registry.ts`：

```typescript
import type { Block, BlockType, BlockCategory } from '../models/types';

/**
 * 块类型配置
 */
export interface BlockTypeConfig {
  /** 块类型标识 */
  type: string;

  /** 人类可读名称 */
  name: string;

  /** 分类 */
  category: BlockCategory;

  /** 图标（用于菜单）*/
  icon: string;

  /** 描述（用于斜杠菜单）*/
  description: string;

  /** 默认内容工厂 */
  defaultContent: () => Record<string, any>;

  /** 校验函数 */
  isValid: (content: Record<string, any>) => boolean;

  /** 允许的子块类型 */
  allowedChildren?: BlockType[];
}

/**
 * 块类型注册中心
 */
export class BlockRegistry {
  private registry = new Map<string, BlockTypeConfig>();

  /**
   * 注册块类型
   */
  register(config: BlockTypeConfig): void {
    if (this.registry.has(config.type)) {
      console.warn(`Block type "${config.type}" already registered, overriding`);
    }
    this.registry.set(config.type, config);
  }

  /**
   * 获取块类型配置
   */
  get(type: string): BlockTypeConfig | undefined {
    return this.registry.get(type);
  }

  /**
   * 检查是否已注册
   */
  has(type: string): boolean {
    return this.registry.has(type);
  }

  /**
   * 列出所有块类型
   */
  list(): BlockTypeConfig[] {
    return Array.from(this.registry.values());
  }

  /**
   * 按分类筛选
   */
  listByCategory(category: BlockCategory): BlockTypeConfig[] {
    return this.list().filter(config => config.category === category);
  }

  /**
   * 创建块实例
   */
  createBlock(
    type: string,
    content?: Record<string, any>,
    metadata = {}
  ): Block | null {
    const config = this.get(type);
    if (!config) {
      return null;
    }

    const blockContent = content ?? config.defaultContent();

    if (!config.isValid(blockContent)) {
      throw new Error(`Invalid content for block type "${type}"`);
    }

    return {
      id: generateBlockId(),  // 从 models 导入
      type: config.type as BlockType,
      content: blockContent,
      metadata,
    };
  }

  /**
   * 校验块内容
   */
  validateBlock(type: string, content: Record<string, any>): boolean {
    const config = this.get(type);
    return config?.isValid(content) ?? false;
  }
}

// 需要导入 generateBlockId
function generateBlockId(): string {
  return `block-${Math.random().toString(36).substring(2, 10)}`;
}
```

- [ ] **Step 2: 创建模块入口**

创建 `apps/web/src/platform/editor/registries/index.ts`：

```typescript
export * from './block-registry';
export type { BlockTypeConfig } from './block-registry';
```

- [ ] **Step 3: 提交**

```bash
git add apps/web/src/platform/editor/registries/block-registry.ts
git add apps/web/src/platform/editor/registries/index.ts
git commit -m "feat(editor): create BlockRegistry for block type management"
```

---

### Task 2.2: 实现内置块类型配置

- [ ] **Step 1: 文本块配置**

创建 `apps/web/src/platform/editor/registries/block-configs/text-block.ts`：

```typescript
import type { BlockTypeConfig } from '../block-registry';

export const textBlockConfig: BlockTypeConfig = {
  type: 'paragraph',
  name: '段落',
  category: 'text',
  icon: '📝',
  description: '正文内容',

  defaultContent: () => ({
    text: '',
    level: undefined,
    style: 'normal' as const,
  }),

  isValid: (content) => {
    return typeof content?.text === 'string';
  },

  allowedChildren: [],
};

export const headingBlockConfig: BlockTypeConfig = {
  type: 'heading',
  name: '标题',
  category: 'text',
  icon: 'H',
  description: '章节标题 (H1-H6)',

  defaultContent: () => ({
    text: '',
    level: 1,
  }),

  isValid: (content) => {
    return (
      typeof content?.text === 'string' &&
      [1, 2, 3, 4, 5, 6].includes(content?.level)
    );
  },

  allowedChildren: [],
};

export const quoteBlockConfig: BlockTypeConfig = {
  type: 'quote',
  name: '引用',
  category: 'text',
  icon: '"',
  description: '引用内容',

  defaultContent: () => ({
    text: '',
  }),

  isValid: (content) => {
    return typeof content?.text === 'string';
  },

  allowedChildren: [],
};
```

- [ ] **Step 2: 列表块配置**

创建 `apps/web/src/platform/editor/registries/block-configs/list-block.ts`：

```typescript
import type { BlockTypeConfig } from '../block-registry';

export const bulletListBlockConfig: BlockTypeConfig = {
  type: 'bullet-list',
  name: '无序列表',
  category: 'list',
  icon: '•',
  description: '项目符号列表',

  defaultContent: () => ({
    items: [{ text: '', checked: false }],
  }),

  isValid: (content) => {
    return Array.isArray(content?.items);
  },

  allowedChildren: [],
};

export const numberedListBlockConfig: BlockTypeConfig = {
  type: 'numbered-list',
  name: '有序列表',
  category: 'list',
  icon: '1.',
  description: '编号列表',

  defaultContent: () => ({
    items: [{ text: '', checked: false }],
  }),

  isValid: (content) => {
    return Array.isArray(content?.items);
  },

  allowedChildren: [],
};

export const taskListBlockConfig: BlockTypeConfig = {
  type: 'task-list',
  name: '待办清单',
  category: 'list',
  icon: '☑',
  description: '待办事项清单',

  defaultContent: () => ({
    items: [{ text: '', checked: false }],
  }),

  isValid: (content) => {
    return Array.isArray(content?.items) &&
      content.items.every((item: any) =>
        typeof item.text === 'string' && typeof item.checked === 'boolean'
      );
  },

  allowedChildren: [],
};
```

- [ ] **Step 3: 代码块配置**

创建 `apps/web/src/platform/editor/registries/block-configs/code-block.ts`：

```typescript
import type { BlockTypeConfig } from '../block-registry';

export const codeBlockConfig: BlockTypeConfig = {
  type: 'code',
  name: '代码块',
  category: 'media',
  icon: '</>',
  description: '带语法高亮的代码',

  defaultContent: () => ({
    code: '',
    language: 'plaintext',
  }),

  isValid: (content) => {
    return typeof content?.code === 'string' &&
      typeof content?.language === 'string';
  },

  allowedChildren: [],
};
```

- [ ] **Step 4: 注册所有内置块类型**

修改 `apps/web/src/platform/editor/registries/index.ts`：

```typescript
export * from './block-registry';
export type { BlockTypeConfig } from './block-registry';

// 导出所有内置块配置
export {
  textBlockConfig,
  headingBlockConfig,
  quoteBlockConfig,
} from './block-configs/text-block';

export {
  bulletListBlockConfig,
  numberedListBlockConfig,
  taskListBlockConfig,
} from './block-configs/list-block';

export { codeBlockConfig } from './block-configs/code-block';

/**
 * 注册所有内置块类型
 */
export function registerBuiltInBlocks(registry: BlockRegistry): void {
  registry.register(textBlockConfig);
  registry.register(headingBlockConfig);
  registry.register(quoteBlockConfig);
  registry.register(bulletListBlockConfig);
  registry.register(numberedListBlockConfig);
  registry.register(taskListBlockConfig);
  registry.register(codeBlockConfig);
}
```

- [ ] **Step 5: 提交**

```bash
git add apps/web/src/platform/editor/registries/block-configs/
git add apps/web/src/platform/editor/registries/index.ts
git commit -m "feat(editor): add built-in block type configurations"
```

---

### Task 2.3: BlockRegistry 测试

- [ ] **Step 1: 创建测试文件**

创建 `apps/web/src/platform/editor/registries/__tests__/block-registry.test.ts`：

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { BlockRegistry, registerBuiltInBlocks } from '../../index';

describe('BlockRegistry', () => {
  let registry: BlockRegistry;

  beforeEach(() => {
    registry = new BlockRegistry();
    registerBuiltInBlocks(registry);
  });

  describe('register', () => {
    it('should register a new block type', () => {
      const customBlock = {
        type: 'custom',
        name: 'Custom Block',
        category: 'text' as const,
        icon: '🔷',
        description: 'A custom block',
        defaultContent: () => ({ data: '' }),
        isValid: (content: any) => typeof content?.data === 'string',
      };

      registry.register(customBlock);

      expect(registry.has('custom')).toBe(true);
      expect(registry.get('custom')).toEqual(customBlock);
    });

    it('should warn when overriding existing type', () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      registry.register({
        type: 'paragraph',
        name: 'Overridden Paragraph',
        category: 'text' as const,
        icon: '📝',
        description: 'Overridden',
        defaultContent: () => ({ text: '' }),
        isValid: () => true,
      });

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('already registered')
      );

      consoleWarnSpy.mockRestore();
    });
  });

  describe('get and has', () => {
    it('should return block config for registered type', () => {
      const config = registry.get('paragraph');

      expect(config).toBeDefined();
      expect(config?.name).toBe('段落');
    });

    it('should return undefined for unregistered type', () => {
      const config = registry.get('nonexistent');

      expect(config).toBeUndefined();
    });

    it('should return true for has with registered type', () => {
      expect(registry.has('paragraph')).toBe(true);
      expect(registry.has('code')).toBe(true);
    });

    it('should return false for has with unregistered type', () => {
      expect(registry.has('nonexistent')).toBe(false);
    });
  });

  describe('list and listByCategory', () => {
    it('should list all registered block types', () => {
      const allBlocks = registry.list();

      expect(allBlocks.length).toBeGreaterThan(0);
      expect(allBlocks.map(b => b.type)).toContain('paragraph');
    });

    it('should filter blocks by category', () => {
      const textBlocks = registry.listByCategory('text');

      expect(textBlocks.every(b => b.category === 'text')).toBe(true);
      expect(textBlocks.map(b => b.type)).toContain('paragraph');

      const listBlocks = registry.listByCategory('list');
      expect(listBlocks.every(b => b.category === 'list')).toBe(true);
    });
  });

  describe('createBlock', () => {
    it('should create a block with default content', () => {
      const block = registry.createBlock('paragraph');

      expect(block).not.toBeNull();
      expect(block?.type).toBe('paragraph');
      expect(block?.content).toEqual({
        text: '',
        level: undefined,
        style: 'normal',
      });
    });

    it('should create a block with custom content', () => {
      const block = registry.createBlock('paragraph', { text: 'Hello' });

      expect(block?.content.text).toBe('Hello');
    });

    it('should return null for unregistered type', () => {
      const block = registry.createBlock('nonexistent');

      expect(block).toBeNull();
    });

    it('should throw error for invalid content', () => {
      expect(() => {
        registry.createBlock('paragraph', { invalid: 'content' });
      }).toThrow('Invalid content for block type');
    });
  });

  describe('validateBlock', () => {
    it('should return true for valid content', () => {
      const valid = registry.validateBlock('paragraph', { text: 'Hello' });
      expect(valid).toBe(true);
    });

    it('should return false for invalid content', () => {
      const valid = registry.validateBlock('paragraph', { wrong: 'key' });
      expect(valid).toBe(false);
    });

    it('should return false for unregistered type', () => {
      const valid = registry.validateBlock('nonexistent', {});
      expect(valid).toBe(false);
    });
  });
});
```

- [ ] **Step 2: 运行测试**

```bash
cd apps/web && npm run test -- --run src/platform/editor/registries/__tests__/block-registry.test.ts
```

预期：所有测试通过

- [ ] **Step 3: 提交**

```bash
git add apps/web/src/platform/editor/registries/__tests__/
git commit -m "test(editor): add BlockRegistry unit tests"
```

---

## Task 3: EditorContainer 与 EditorService

**Files:**
- Create: `apps/web/src/platform/editor/container/editor-container.ts`
- Create: `apps/web/src/platform/editor/services/editor-service.ts`
- Create: `apps/web/src/platform/editor/stores/editor-store.ts`

---

### Task 3.1: 创建编辑器 Zustand Store

- [ ] **Step 1: 创建编辑器状态 Store**

创建 `apps/web/src/platform/editor/stores/editor-store.ts`：

```typescript
import { create } from 'zustand';
import type { DocumentModel, SelectionState, FormatState, SaveState } from '../models/types';

export interface EditorStoreApi {
  // 当前文档
  currentDocument: DocumentModel | null;

  // 选区状态
  selection: SelectionState | null;

  // 格式状态
  formatState: FormatState | null;

  // 保存状态
  saveState: SaveState;

  // 脏标记（是否有未保存的修改）
  isDirty: boolean;

  // 文档 ID
  documentId: string | null;

  // Actions
  setCurrentDocument: (doc: DocumentModel | null) => void;
  setSelection: (selection: SelectionState | null) => void;
  setFormatState: (format: FormatState | null) => void;
  setSaveState: (state: SaveState) => void;
  setIsDirty: (dirty: boolean) => void;
  setDocumentId: (id: string | null) => void;

  // 重置 Store
  reset: () => void;
}

export function createEditorStore(documentId: string) {
  return create<EditorStoreApi>()((set) => ({
    // Initial state
    currentDocument: null,
    selection: null,
    formatState: null,
    saveState: SaveState.IDLE,
    isDirty: false,
    documentId,

    // Actions
    setCurrentDocument: (doc) => set({ currentDocument: doc }),
    setSelection: (selection) => set({ selection }),
    setFormatState: (format) => set({ formatState: format }),
    setSaveState: (state) => set({ saveState: state }),
    setIsDirty: (dirty) => set({ isDirty: dirty }),
    setDocumentId: (id) => set({ documentId: id }),

    // Reset
    reset: () => set({
      currentDocument: null,
      selection: null,
      formatState: null,
      saveState: SaveState.IDLE,
      isDirty: false,
      documentId: null,
    }),
  }));
}
```

- [ ] **Step 2: 创建模块入口**

创建 `apps/web/src/platform/editor/stores/index.ts`：

```typescript
export * from './editor-store';
```

- [ ] **Step 3: 提交**

```bash
git add apps/web/src/platform/editor/stores/
git commit -m "feat(editor): create Zustand store for editor state management"
```

---

### Task 3.2: 创建 EditorContainer

- [ ] **Step 1: 创建编辑器容器**

创建 `apps/web/src/platform/editor/container/editor-container.ts`：

```typescript
import { BlockRegistry, registerBuiltInBlocks } from '../registries';
import { createEditorStore, type EditorStoreApi } from '../stores';
import type { EditorService } from '../services';

/**
 * 编辑器容器 - 全局单例，管理所有编辑器实例
 */
export class EditorContainer {
  // 单例 Registry
  private blockRegistry: BlockRegistry;

  // 多实例管理
  private editorServices: Map<string, EditorService> = new Map();
  private stores: Map<string, EditorStoreApi> = new Map();

  private static instance: EditorContainer;

  private constructor() {
    // 初始化单例 Registry
    this.blockRegistry = new BlockRegistry();

    // 注册内置块类型
    registerBuiltInBlocks(this.blockRegistry);
  }

  /**
   * 获取全局容器实例（单例）
   */
  static getInstance(): EditorContainer {
    if (!EditorContainer.instance) {
      EditorContainer.instance = new EditorContainer();
    }
    return EditorContainer.instance;
  }

  /**
   * 创建编辑器实例
   */
  createInstance(documentId: string): EditorService {
    // 检查是否已存在
    const existing = this.editorServices.get(documentId);
    if (existing) {
      return existing;
    }

    // 创建 Zustand Store
    const store = createEditorStore(documentId);

    // 保存实例引用
    this.stores.set(documentId, store);

    // TODO: 创建 EditorService
    // const editorService = new EditorService(documentId, store, this.blockRegistry);
    // this.editorServices.set(documentId, editorService);

    throw new Error('EditorService not yet implemented');
  }

  /**
   * 获取编辑器实例
   */
  getInstance(documentId: string): EditorService | null {
    return this.editorServices.get(documentId) || null;
  }

  /**
   * 获取 Store（用于 React 组件订阅）
   */
  getStore(documentId: string): EditorStoreApi | null {
    return this.stores.get(documentId) || null;
  }

  /**
   * 销毁编辑器实例
   */
  disposeInstance(documentId: string): void {
    const service = this.editorServices.get(documentId);
    if (service) {
      service.destroy();
      this.editorServices.delete(documentId);
    }

    const store = this.stores.get(documentId);
    if (store) {
      store.getState().reset();
      this.stores.delete(documentId);
    }
  }

  /**
   * 获取 BlockRegistry
   */
  getBlockRegistry(): BlockRegistry {
    return this.blockRegistry;
  }
}

// 导出全局容器实例
export const editorContainer = EditorContainer.getInstance();
```

- [ ] **Step 2: 创建模块入口**

创建 `apps/web/src/platform/editor/container/index.ts`：

```typescript
export * from './editor-container';
```

- [ ] **Step 3: 提交**

```bash
git add apps/web/src/platform/editor/container/
git commit -m "feat(editor): create EditorContainer for managing editor instances"
```

---

## Task 4: 基础 UI 组件

**Files:**
- Modify: `apps/web/src/components/workspace/editor/editor-area.tsx`
- Modify: `apps/web/src/components/workspace/editor/editor-tabs.tsx`
- Create: `apps/web/src/components/workspace/editor/editor-root.tsx`

---

### Task 4.1: 创建编辑器根组件

- [ ] **Step 1: 创建 EditorRoot 组件**

创建 `apps/web/src/components/workspace/editor/editor-root.tsx`：

```tsx
'use client';

import { useEffect, useRef, useCallback } from 'react';
import { editorContainer } from '@/platform/editor/container';
import type { EditorService } from '@/platform/editor/services';

interface EditorRootProps {
  documentId: string;
  className?: string;
}

export function EditorRoot({ documentId, className }: EditorRootProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const editorServiceRef = useRef<EditorService | null>(null);

  // 初始化编辑器
  useEffect(() => {
    if (!containerRef.current) return;

    // 创建编辑器实例
    const container = editorContainer.getInstance();
    const editorService = container.createInstance(documentId);
    editorServiceRef.current = editorService;

    // 创建 Lexical Editor
    editorService.create(containerRef.current, {
      namespace: 'MyKMEditor',
      theme: {
        // TODO: 定义主题
      },
    });

    // 清理函数
    return () => {
      editorService.destroy();
      container.disposeInstance(documentId);
    };
  }, [documentId]);

  return (
    <div
      ref={containerRef}
      className={className}
      style={{ minHeight: '400px' }}
    />
  );
}
```

- [ ] **Step 2: 更新 editor-area.tsx**

修改 `apps/web/src/components/workspace/editor/editor-area.tsx`：

```tsx
import { EditorRoot } from './editor-root';

export function EditorArea() {
  // TODO: 从 Store 获取当前打开的文档 ID
  const documentId = 'temp-doc-001'; // 临时硬编码

  return (
    <div className="flex h-full flex-col bg-ws-bg-secondary">
      {/* Editor Content */}
      <div className="flex-1 p-4">
        <EditorRoot documentId={documentId} className="h-full" />
      </div>
    </div>
  );
}
```

- [ ] **Step 3: 提交**

```bash
git add apps/web/src/components/workspace/editor/
git commit -m "feat(editor): add EditorRoot component for Lexical integration"
```

---

## 后续 Task（Phase 1 剩余工作）

### Task 5: EditorService 实现
- Lexical Editor 创建与配置
- 文档加载/保存方法
- 选区追踪

### Task 6: AutoSaveService 实现
- 防抖保存逻辑
- 与文件系统集成

### Task 7: AIContextService 实现
- 上下文收集
- 与 AI Panel 集成

### Task 8: 集成测试与 E2E 测试
- 编辑器基本功能测试
- 保存流程测试

---

## 测试策略

### 单元测试 (Vitest)
- 所有 Service 和 Registry 必须有单元测试
- 测试文件与源文件同目录 `__tests__/` 子目录

### 组件测试 (Testing Library)
- UI 组件需要测试用户交互

### 集成测试
- 编辑器创建/销毁流程
- 文档保存/加载流程

---

## 提交规范

遵循 Conventional Commits:
- `feat(editor): add new feature`
- `fix(editor): fix bug`
- `test(editor): add tests`
- `refactor(editor): refactor code`

---

**Plan 审查检查点:**
- Task 1 完成后：审查文档模型设计
- Task 2 完成后：审查块类型注册机制
- Task 3 完成后：审查编辑器容器架构
- Task 4 完成后：审查 UI 集成
- 所有 Task 完成后：端到端测试验证
