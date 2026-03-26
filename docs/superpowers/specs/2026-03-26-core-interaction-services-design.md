# 核心交互服务设计文档

**创建日期**: 2026-03-26
**状态**: 待实现
**批次**: 第一批（核心交互层）

---

## 1. 概述

本文档描述项目核心交互层三个基础服务的设计：
- 快捷键调度体系
- 撤销重做服务
- 活跃文件管理服务

这三个服务是编辑器流畅体验的基础，优先实施。

---

## 2. 架构位置

```
┌─────────────────────────────────────────────────────────┐
│                    UI 层 (React/Zustand)                 │
├─────────────────────────────────────────────────────────┤
│                    服务层 (Services)                     │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐  │
│  │ ShortcutSvc │  │UndoRedoSvc  │  │ ActiveFileSvc   │  │
│  └─────────────┘  └─────────────┘  └─────────────────┘  │
├─────────────────────────────────────────────────────────┤
│                  平台层 (Platform)                       │
│  DI 容器 │ 事件总线 │ FileSystem │ EditorContainer      │
└─────────────────────────────────────────────────────────┘
```

---

## 3. 服务设计

### 3.1 快捷键调度体系 (ShortcutService)

#### 职责
- 全局快捷键捕获和拦截
- 命令注册与注销
- 条件触发判定（同快捷键不同场景差异化响应）
- 命令手动执行（供菜单项复用）

#### 核心接口

```typescript
/**
 * 快捷键命令定义
 */
interface ShortcutCommand {
    /** 命令唯一标识，如 "editor.undo", "file.save" */
    id: string;

    /** 快捷键组合，如 "Ctrl+C", "Cmd+S", "Ctrl+Shift+N" */
    shortcut: string;

    /** 命令处理器 */
    handler: (ctx: CommandContext) => void | Promise<void>;

    /** 条件触发函数，返回 false 时不执行 */
    when?: (ctx: CommandContext) => boolean;

    /** 作用域，用于条件判定 */
    target?: 'global' | 'editor' | 'input';
}

/**
 * 命令执行上下文
 */
interface CommandContext {
    /** 当前活跃编辑器 */
    activeEditor?: EditorService;

    /** 当前活跃文件路径 */
    activeFile?: string;

    /** 触发事件的原始 KeyboardEvent（如果有） */
    sourceEvent?: KeyboardEvent;
}

/**
 * 快捷键服务
 */
@Service({ singleton: true })
class ShortcutService extends ServiceBase {
    /**
     * 注册快捷键命令
     * @param cmd 命令定义
     * @returns IDisposable 用于取消注册
     */
    register(cmd: ShortcutCommand): IDisposable;

    /**
     * 注销快捷键命令
     * @param id 命令 ID
     */
    unregister(id: string): void;

    /**
     * 手动执行命令
     * @param commandId 命令 ID
     * @param ctx 执行上下文（可选）
     */
    execute(commandId: string, ctx?: CommandContext): Promise<void>;

    /**
     * 获取所有已注册的命令
     */
    getRegisteredCommands(): ShortcutCommand[];
}
```

#### 设计决策

| 决策点 | 选择 | 理由 |
|--------|------|------|
| 快捷键库 | hotkeys.js 或类似 | 处理浏览器差异、组合键解析 |
| 条件触发 | `when` 函数 | 灵活支持场景判定 |
| 资源管理 | 返回 IDisposable | 集成现有 Disposable 模式 |
| 作用域 | target 字段 | 简化条件判定逻辑 |

#### 与现有架构集成

- 继承 `ServiceBase`，使用 `_store` 管理 hotkeys 实例
- 通过 DI 容器注入到其他服务
- `register` 返回的 `IDisposable` 加入 `_store` 自动释放

---

### 3.2 撤销重做服务 (UndoRedoService)

#### 职责
- 统一管理编辑器内容的撤销/重做操作
- 按文档 ID 分栈管理
- 支持操作合并（如连续字符合并）
- 提供状态查询和事件通知

#### 核心接口

```typescript
/**
 * 可撤销操作接口
 */
interface UndoableOperation {
    /** 操作唯一标识 */
    id: string;

    /** 撤销操作 */
    undo(): Promise<void>;

    /** 重做操作 */
    redo(): Promise<void>;

    /**
     * 是否可与另一个操作合并
     * @param other 另一个操作
     * @returns 可合并且返回 true
     */
    mergeWith?(other: UndoableOperation): boolean;
}

/**
 * 撤销重做服务
 */
@Service({ singleton: true })
class UndoRedoService extends ServiceBase {
    /**
     * 推入新操作
     * @param documentId 文档 ID
     * @param op 可撤销操作
     */
    push(documentId: string, op: UndoableOperation): void;

    /**
     * 撤销
     * @param documentId 文档 ID
     */
    undo(documentId: string): Promise<void>;

    /**
     * 重做
     * @param documentId 文档 ID
     */
    redo(documentId: string): Promise<void>;

    /**
     * 清空操作栈
     * @param documentId 文档 ID
     */
    clear(documentId: string): void;

    /**
     * 是否可撤销
     */
    canUndo(documentId: string): boolean;

    /**
     * 是否可重做
     */
    canRedo(documentId: string): boolean;

    /**
     * 操作栈变化事件
     */
    onStackChange: Event<{
        documentId: string;
        canUndo: boolean;
        canRedo: boolean;
    }>;
}
```

#### 设计决策

| 决策点 | 选择 | 理由 |
|--------|------|------|
| 栈管理 | 按文档 ID 分栈 | 支持多文档独立撤销重做 |
| 操作合并 | `mergeWith` 可选方法 | 由操作自己决定是否可合并 |
| 范围 | 第一批仅编辑器内容 | 控制范围，快速迭代 |
| 事件通知 | `onStackChange` | UI 按钮状态更新 |

#### 与现有架构集成

- 与 `EditorService` 集成，内容变化时 `push` 操作
- 使用现有 `Emitter` 实现事件通知
- 通过 DI 容器注入

---

### 3.3 活跃文件管理服务 (ActiveFileService)

#### 职责
- 统一管理当前打开的所有文件
- 提供文件打开、关闭、切换的统一 API
- 监听文件外部变更，自动同步
- 维护活跃焦点文件状态

#### 核心接口

```typescript
/**
 * 打开的文件信息
 */
interface OpenFile {
    /** 文档 ID */
    id: string;

    /** 文件路径 */
    path: string;

    /** 文件标题 */
    title: string;

    /** 是否为脏状态（已修改未保存） */
    isDirty: boolean;

    /** 编辑器实例（如果有） */
    editor?: EditorService;
}

/**
 * 活跃文件服务
 */
@Service({ singleton: true })
class ActiveFileService extends ServiceBase {
    // 内部依赖（通过容器获取）
    private fileService: FileSystemService;
    private editorContainer: EditorContainer;
    private uiStore: ReturnType<typeof useEditorUIStore>;

    /**
     * 打开文件
     * @param path 文件路径
     */
    open(path: string): Promise<void>;

    /**
     * 关闭文件
     * @param path 文件路径
     */
    close(path: string): Promise<void>;

    /**
     * 激活文件
     * @param path 文件路径
     */
    activate(path: string): void;

    /**
     * 保存文件
     * @param path 文件路径
     */
    save(path: string): Promise<void>;

    /**
     * 获取当前活跃文件
     */
    getActive(): OpenFile | undefined;

    /**
     * 获取所有打开的文件
     */
    getAll(): OpenFile[];

    /**
     * 检查文件是否已打开
     */
    isActive(path: string): boolean;

    /**
     * 活跃文件变化事件
     */
    onActiveFileChange: Event<OpenFile | undefined>;

    /**
     * 文件保存事件
     */
    onFileSaved: Event<string>;  // 文件路径
}
```

#### 设计决策

| 决策点 | 选择 | 理由 |
|--------|------|------|
| 状态存储 | 包装 useEditorUIStore | 复用现有 Zustand store |
| 文件读写 | FileSystemService | 复用现有文件系统能力 |
| 编辑器管理 | EditorContainer | 复用现有编辑器容器 |
| 事件通知 | onActiveFileChange | 面包屑、标题栏等模块订阅 |

#### 与现有架构集成

- 内部使用 `useEditorUIStore` 存储状态
- 调用 `FileSystemService.readFile/writeFile` 读写文件
- 调用 `EditorContainer.createInstance/disposeInstance` 管理编辑器

---

## 4. 数据流

### 4.1 快捷键执行流程

```
用户按下快捷键
    │
    ▼
ShortcutService 捕获（通过 hotkeys.js）
    │
    ▼
检查 when 条件
    │
    ▼
执行 handler
    │
    ├──► ActiveFileService.open()  (如果是打开文件命令)
    │
    ├──► EditorService.insertBlock() (如果是插入命令)
    │
    └──► UndoRedoService.undo()  (如果是撤销命令)
```

### 4.2 撤销重做流程

```
用户内容修改
    │
    ▼
EditorService 检测到变化
    │
    ▼
创建 UndoableOperation 并 push 到 UndoRedoService
    │
    ▼
用户按下 Ctrl+Z
    │
    ▼
ShortcutService 执行撤销命令
    │
    ▼
UndoRedoService.undo()
    │
    ▼
op.undo() 恢复内容
    │
    ▼
EditorService 更新 UI
    │
    ▼
onStackChange 通知按钮状态更新
```

### 4.3 文件打开流程

```
用户点击文件或按下打开命令
    │
    ▼
ActiveFileService.open(path)
    │
    ├──► FileSystemService.readFile(path)
    │
    ├──► EditorContainer.createInstance(docId)
    │
    ├──► EditorService.loadDocument(doc)
    │
    ├──► useEditorUIStore.openDocument(doc)
    │
    └──► onActiveFileChange 通知订阅者
```

---

## 5. 错误处理

### 5.1 快捷键服务

| 错误场景 | 处理方式 |
|----------|----------|
| 快捷键格式无效 | 注册时抛出错误 |
| 命令 ID 冲突 | 警告并覆盖（允许重新注册） |
| handler 执行失败 | 捕获错误并输出日志，不阻断其他命令 |

### 5.2 撤销重做服务

| 错误场景 | 处理方式 |
|----------|----------|
| 空栈撤销 | 无操作，不抛错 |
| undo/redo 失败 | 捕获错误，输出日志，清空操作栈防止状态不一致 |
| 文档已关闭 | 自动清理对应操作栈 |

### 5.3 活跃文件服务

| 错误场景 | 处理方式 |
|----------|----------|
| 文件不存在 | 抛出 NotFoundError |
| 文件权限不足 | 抛出 PermissionError |
| 编辑器创建失败 | 关闭已打开的 UI 状态，抛出错误 |

---

## 6. 测试策略

### 6.1 单元测试

```typescript
// ShortcutService 测试
describe('ShortcutService', () => {
    it('应成功注册快捷键', () => {});
    it('应支持取消注册', () => {});
    it('应支持条件触发', () => {});
    it('应支持手动执行命令', () => {});
});

// UndoRedoService 测试
describe('UndoRedoService', () => {
    it('应支持 push/undo/redo', () => {});
    it('应支持操作合并', () => {});
    it('应支持多文档独立栈', () => {});
    it('应触发 onStackChange 事件', () => {});
});

// ActiveFileService 测试
describe('ActiveFileService', () => {
    it('应支持打开文件', () => {});
    it('应支持关闭文件', () => {});
    it('应支持激活文件', () => {});
    it('应触发 onActiveFileChange 事件', () => {});
});
```

### 6.2 集成测试

- 快捷键 → 命令 → 编辑器响应
- 编辑器内容修改 → 撤销重做
- 文件打开 → 编辑器创建 → UI 更新

---

## 7. 实施顺序

1. **ActiveFileService**（依赖最少，复用现有组件）
2. **ShortcutService**（需要引入第三方库）
3. **UndoRedoService**（依赖 EditorService 完善）

---

## 8. 与后续批次的关系

### 第二批依赖
- ShortcutService → 快捷键冲突检测服务
- UndoRedoService → 事件总线完善（交付队列）
- ActiveFileService → 全局状态管理

### 第三批依赖
- 面板布局管理 → 依赖 ActiveFileService 的活跃文件状态
- 主题管理 → 独立，无依赖

---

## 9. 待决策事项

| 事项 | 状态 |
|------|------|
| hotkeys.js 库选型 | 待确认 |
| UndoableOperation 合并策略细节 | 实现时确定 |
| ActiveFileService 与 EditorUIStore 边界 | 实现时确定 |
