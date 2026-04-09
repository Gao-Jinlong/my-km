# 编辑器架构审查与重设计

## 背景

两个 bug 暴露出深层的架构问题：
1. **Ctrl+S 无法保存** — 快捷键 handler 捕获了过期的闭包状态
2. **切换文件时编辑器内容不更新** — 切换 tab 时内容从未加载

根本原因：**所有文档共享同一个 Lexical 编辑器实例**，没有清晰的归属边界。

---

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | 范围与策略 | 0 | — | — |
| Codex Review | `/codex review` | 独立第二意见 | 0 | — | — |
| Eng Review | `/plan-eng-review` | 架构与测试（必需） | 5 | ISSUES_OPEN | 7 个问题，1 个关键缺口 |
| Design Review | `/plan-design-review` | UI/UX 缺口 | 0 | — | — |
| DX Review | `/plan-devex-review` | 开发者体验缺口 | 0 | — | — |

**结论：** 架构审查已通过 — 所有架构决策已由用户确认，3 个回归测试待实施

---

## 第 0 步：范围界定

**已有代码部分解决了子问题：**
- `EditorContainer` 已实现每个文档独立的 EditorService 实例（正确）
- `EditorTabService` 已实现文档 tab 状态管理（正确）
- `FileOpenService` 已实现文件读取和文档创建（正确）
- 服务层架构是合理的。bug 出在 React → Lexical 的边界层。

**修复两个 bug 的最小改动：**
1. 为每个文档分配独立的 Lexical 实例（修复 tab 切换）
2. 修复 ShortcutProvider 避免捕获过期闭包（修复 Ctrl+S）
3. 修复 EditorService.setEditor() 的清理逻辑（修复监听器泄漏）

**复杂度检查：** 修改 ~6 个文件，0 个新类。低于 8 文件阈值。

**完整性检查：** 执行完整方案。两个 bug + 监听器泄漏 + 状态同步全部覆盖。

---

## 架构审查

### 数据流图（当前 — 已损坏）

```
文件树点击
    │
    ▼
FileOpenService.openFile(path)
    │  读取文件 → 解析为 Block[] → 创建 OpenDocument
    ▼
EditorTabService.openDocument(doc)
    │  触发 onDidChangeActive → 更新 ConditionalService 上下文
    ▼
useEditorTabs() [useSyncExternalStore]
    │  React 重新渲染 EditorArea
    ▼
EditorArea ─► EditorRoot ─► ContentArea ─► LexicalEditor
    │                                          │
    │  activeDocumentId 变化                    │ 没有 key prop → 复用同一个 LexicalComposer
    │  从 OpenDocument 解析新的 Document         │
    ▼                                          ▼
EditorBridgePlugin                       EditorContentPlugin
    │                                          │
    │ 创建/复用 EditorService                  │ isSwitchingToDifferentDocument === true
    │ 调用 setEditor(同一个 editor)            │ lastDocumentIdRef !== null
    ▼                                          │ → 跳过内容加载 ◄── BUG 2
EditorService-B.setEditor(editor)             ▼
    │  注册 updateListener                   内容保持为文档 A
    │  （之前的监听器未清理）                   用户看到错误的内容
    ▼
  BUG 3: 监听器泄漏，isDirty 状态错乱
```

```
Ctrl+S 按下
    │
    ▼
KeyboardShortcutService
    │  规范化按键 → "ctrl+s"
    │  评估 IS_EDITOR_ACTIVE 条件 ✓
    ▼
ShortcutProvider.handle()
    │  使用闭包中的 activeDocumentId
    │  （在 useEffect 上次运行时捕获）
    ▼
editorContainer.getService(activeDocumentId)
    │
    ▼
editorService.saveDocument()
    │  lexicalToBlocks(this.editor)
    │  → 从共享的 Lexical 实例获取内容
    │  → 可能是错误文档的内容 ◄── BUG 1 变种
    │
    ▼
  fileSystem.writeFile(path, content)
     → 可能写入错误的内容到文件
```

### 问题 1：所有文档共享单个 Lexical 实例 [严重]

**[P0] (置信度: 10/10) `content-area.tsx:35-40` — LexicalEditor 没有 `key` prop**

`LexicalComposer` 在 `LexicalEditorImpl` 中只实例化一次。当 `documentId` 变化（tab 切换）时，React 复用同一个组件实例。所有文档共享同一个 Lexical editor 对象。

影响：每个 EditorService 都被调用 `setEditor(同一个editor)`。内容状态不确定。

### 问题 2：EditorContentPlugin 在 tab 切换时跳过内容加载 [严重]

**[P0] (置信度: 10/10) `lexical-editor.tsx:162-175` — tab 切换跳过内容加载**

```typescript
} else {
    // 切换到另一个文档
    lastDocumentIdRef.current = documentId;
    // 注意：这里不重新加载内容，因为 EditorService 已经保存了编辑后的内容
    // Lexical 编辑器会通过 EditorBridgePlugin 注入的 editor 实例保持内容
}
```

注释是错误的。EditorService 并没有单独保存内容。内容只存在于 Lexical 实例中。跳过加载意味着编辑器显示过期内容。

### 问题 3：setEditor() 监听器泄漏 [严重]

**[P0] (置信度: 9/10) `EditorService.ts:164-176` — registerUpdateListener 从未清理**

`setEditor()` 调用 `editor.registerUpdateListener()` 返回一个清理函数。这个清理函数从未被存储或调用。当 tab 切换触发另一个 EditorService 的 `setEditor()` 调用时，旧的监听器仍然存在，导致：
- EditorService-A 的监听器在编辑文档 B 时触发 → 错误的 isDirty
- 每次 tab 切换累积监听器 → 内存泄漏

### 问题 4：ShortcutProvider 过期闭包 [高]

**[P1] (置信度: 8/10) `shortcut-provider.tsx:37-168` — useEffect 频繁重新注册快捷键**

`useEffect` 依赖 `[activeDocumentId, closeDocument, openDocuments]`。由于每次 isDirty 更新（来自 `editorTabService.updateDocument()`）都会改变 `openDocuments`，快捷键被频繁销毁和重新注册。在销毁和重新注册之间，快捷键不可用。

此外，handler 从闭包中捕获 `activeDocumentId`，而不是在执行时从服务中读取。

### 问题 5：ContentArea 每次渲染都重新解析 JSON [中]

**[P2] (置信度: 7/10) `content-area.tsx:20-28` — 渲染路径中的 JSON.parse**

```typescript
content: openDoc.content ? JSON.parse(openDoc.content) || [] : [],
```

每次渲染都执行。应该用 useMemo 缓存。

### 问题 6：Lexical 更新监听器重复 [中]

**[P2] (置信度: 8/10) `EditorService.ts:168` + `AutoSaveService.ts` — 同一事件两个监听器**

EditorService 注册一个 `registerUpdateListener` 追踪 isDirty。AutoSaveService 注册另一个触发保存。两者在同一个 Lexical 更新事件时触发。

### 问题 7：内容状态没有同步机制 [高]

**[P1] (置信度: 8/10) — 文档内容有三个真相源**

1. `OpenDocument.content` 在 EditorTabService 中（原始解析内容，从不更新）
2. `EditorService.currentDocument.content`（在 loadDocument 时设置，从不更新）
3. Lexical 编辑器状态（实际渲染的内容，唯一的真相源）

首次加载后，只有 Lexical 状态是活跃的。其他两个是过期的。如果任何代码从中读取，会得到错误的数据。

---

## 目标架构设计

```
文件树点击
    │
    ▼
FileOpenService.openFile(path)
    │  读取文件 → 创建 OpenDocument
    ▼
EditorTabService.openDocument(doc)
    │  触发 onDidChangeDocuments
    ▼
EditorArea（渲染所有已打开的文档）
    │
    ├─► EditorTabs（tab 栏）
    │
    └─► EditorRoot key={doc.id}（每个打开的文档一个）
         │   visible={doc.id === activeDocumentId}
         │   （非活动编辑器：display:none，仍然挂载）
         ▼
         ContentArea ─► LexicalEditor
          │                │
          │                └─► LexicalComposer（每个文档独立）
          │                     ├─► EditorBridgePlugin → setEditor()
          │                     └─► EditorContentPlugin → blocksToLexical()
          │
          └─► EditorService（每个文档一个，拥有自己的 Lexical 实例）
               │
               ├─► setEditor() 注册一个 updateListener（在 destroy 时清理）
               ├─► loadDocument() 将 Block[] → Lexical 节点
               ├─► saveDocument() 将 Lexical 节点 → Markdown → writeFile
               └─► onChange 事件 → EditorTabService.updateDocument({isDirty})

KeyboardShortcutService
    │
    └─► Ctrl+S handler 从服务读取 activeDocumentId（非闭包）
         └─► editorService.saveDocument()
```

### 关键设计决策

**决策 1：每个文档一个 Lexical 实例（CSS 可见性切换）**

渲染所有已打开文档的编辑器。只有活动的可见（`display: block/none`）。每个都有自己的 `key={documentId}` 确保独立的 React 生命周期。

为什么不用基于 `key` 的重新挂载（每次切换销毁重建）？
- 丢失 undo 历史
- 丢失光标位置
- 内容闪烁
- 对知识管理工具来说 UX 差

为什么不用手动状态序列化的实例池？
- 更复杂
- 重新发明 React 调和已经做的事
- 容易出错（过期状态、遗漏事件）

CSS 可见性切换是最简洁的正确方案。内存开销可忽略（通常 <20 个 tab）。

**决策 2：在快捷键执行时从服务读取 activeDocumentId**

不通过闭包捕获 `activeDocumentId`，而是在快捷键触发时直接从 `EditorTabService` 读取。effect 只依赖稳定引用。

**决策 3：在 destroy() 中清理 setEditor() 的监听器**

`setEditor()` 返回一个清理函数。存储它并在 `destroy()` 中调用。

**决策 4：移除 EditorContentPlugin 的 tab 切换逻辑**

由于每个文档有独立的 Lexical 实例，`EditorContentPlugin` 只需要处理初始内容加载。移除 `isSwitchingToDifferentDocument` 分支。

**决策 5：ContentArea 中用 useMemo 缓存内容解析**

使用 `useMemo` 仅在内容变化时解析 `openDoc.content`。

---

## 实施步骤

### 步骤 1：修改 EditorArea 渲染所有已打开的文档

**文件：** `apps/web/src/components/workspace/editor/editor-area.tsx`

从渲染一个 `EditorRoot` 改为渲染所有，用 CSS 可见性控制：

```tsx
{openDocuments.map(doc => (
    <div
        key={doc.id}
        className={cn('flex-1', doc.id === activeDocumentId ? 'flex' : 'hidden')}
    >
        <EditorRoot documentId={doc.id} className="h-full" />
    </div>
))}
```

### 步骤 2：简化 EditorContentPlugin

**文件：** `apps/web/src/components/workspace/editor/lexical-editor.tsx`

移除 tab 切换逻辑。插件只在挂载时加载一次内容：

```tsx
function EditorContentPlugin({ document: doc }: { document: Document | null; documentId: string }) {
    const [editor] = useLexicalComposerContext();
    const loadedRef = useRef(false);

    useEffect(() => {
        if (!doc || !editor || loadedRef.current) return;
        loadedRef.current = true;
        blocksToLexical(doc.content, editor);
    }, [doc, editor]);

    return null;
}
```

由于每个文档有自己的 LexicalComposer（通过 EditorArea 中的 `key={doc.id}`），此插件每个文档只运行一次。

### 步骤 3：修复 EditorBridgePlugin 清理逻辑

**文件：** `apps/web/src/components/workspace/editor/lexical-editor.tsx`

由于组件现在是每个文档独立的（只在文档关闭时卸载），清理逻辑需要最小化。但仍需在卸载时清理订阅。

### 步骤 4：修复 EditorService.setEditor() 监听器清理

**文件：** `apps/web/src/features/editor/service/EditorService.ts`

存储监听器清理函数并在 `destroy()` 中调用：

```typescript
private updateListenerCleanup: (() => void) | null = null;

setEditor(editor: LexicalEditor): void {
    this.editor = editor;
    this.updateListenerCleanup = editor.registerUpdateListener(({ dirtyElements, dirtyLeaves }) => {
        if ((dirtyElements?.size ?? 0) > 0 || (dirtyLeaves?.size ?? 0) > 0) {
            this.setState({ isDirty: true });
        }
    });
}

destroy(): void {
    this.updateListenerCleanup?.();
    this.updateListenerCleanup = null;
    // ... 其余清理逻辑
}
```

### 步骤 5：修复 ShortcutProvider

**文件：** `apps/web/src/components/workspace/shortcut-provider.tsx`

在执行时从服务读取 `activeDocumentId`，而非从闭包：

```typescript
handle: () => {
    const tabService = container.get(EditorTabService);
    const activeId = tabService.getActiveDocumentId(); // 执行时读取
    if (activeId) {
        const editorContainer = container.get(EditorContainer);
        const editorService = editorContainer.getService(activeId);
        editorService?.saveDocument().catch(console.error);
    }
},
```

使 effect 依赖稳定（只注册一次，不重复注册）：

```typescript
useEffect(() => {
    // 挂载时注册快捷键一次
    // ... handler 从服务读取状态，不使用闭包
    return () => disposables.dispose();
}, []); // 空依赖
```

### 步骤 6：ContentArea 中用 useMemo 缓存内容解析

**文件：** `apps/web/src/components/workspace/editor/content-area.tsx`

```typescript
const document = useMemo<Document | null>(() => {
    const openDoc = openDocuments.find(d => d.id === documentId);
    if (!openDoc) return null;
    return {
        id: openDoc.id,
        path: openDoc.path,
        title: openDoc.title,
        type: openDoc.type,
        content: openDoc.content ? JSON.parse(openDoc.content) || [] : [],
        version: 1,
        createdAt: openDoc.openedAt,
        updatedAt: openDoc.openedAt,
    };
}, [openDocuments, documentId]);
```

---

## 需要修改的文件

| 文件 | 修改内容 |
|------|----------|
| `apps/web/src/components/workspace/editor/editor-area.tsx` | 渲染所有文档，CSS 可见性控制 |
| `apps/web/src/components/workspace/editor/lexical-editor.tsx` | 简化 EditorContentPlugin，修复 EditorBridgePlugin |
| `apps/web/src/components/workspace/editor/content-area.tsx` | useMemo 缓存内容解析 |
| `apps/web/src/features/editor/service/EditorService.ts` | 修复 setEditor 监听器清理 |
| `apps/web/src/components/workspace/shortcut-provider.tsx` | 从服务读取状态，稳定依赖 |

---

## 不在范围内

- AutoSaveService 集成（当前未接入，单独 PR）
- Toolbar 重新连接（Toolbar 组件存在但 EditorRoot 使用占位实现）
- 块级格式按钮（H1-H6、列表、引用）
- 文件系统监听器
- 超过 50 个 tab 的性能优化

---

## 已有代码复用

- `EditorContainer` 每文档实例管理 → 原样复用
- `EditorTabService` tab 状态管理 → 原样复用（已有 getActiveDocumentId() 方法）
- `EditorService` 文档操作 → 修复监听器泄漏，其余正确
- `FileOpenService` 文件读取 → 原样复用
- `ConditionalService` 条件评估 → 原样复用

---

## 测试审查

### 覆盖率图

```
代码路径覆盖率
===========================
[+] EditorService.setEditor()
    ├── [★★  已测试] 存储 editor 引用 — EditorService.test.ts:130
    ├── [★★  已测试] registerUpdateListener 被调用 — EditorService.test.ts:134
    ├── [缺口]        destroy() 中的监听器清理 — 无测试
    └── [缺口]        内容变化时设置 isDirty — 无测试

[+] EditorService.loadDocument()
    ├── [★★  已测试] 加载文档，重置状态 — EditorService.test.ts:37
    ├── [缺口]        调用 blocksToLexical 传入正确内容 — 无测试
    └── [缺口]        转换失败时设置 error — 无测试

[+] EditorService.saveDocument()
    ├── [★★  已测试] 无 editor 时返回错误 — EditorService.test.ts:92
    ├── [缺口]        Lexical → blocks → markdown 转换 — 无测试
    ├── [缺口]        调用 fileSystem.writeFile — 无测试
    ├── [缺口]        成功后清除 isDirty — 无测试
    └── [缺口]        写入失败时设置 error — 无测试

[+] EditorContentPlugin (lexical-editor.tsx)
    ├── [缺口]        挂载时加载内容 — 无测试
    └── [缺口]        同一文档不重复加载 — 无测试

[+] EditorBridgePlugin (lexical-editor.tsx)
    ├── [缺口]        通过 EditorContainer 创建 EditorService — 无测试
    ├── [缺口]        注入 Lexical 实例 — 无测试
    └── [缺口]        同步 isDirty 到 EditorTabService — 无测试

[+] ShortcutProvider (shortcut-provider.tsx)
    ├── [缺口]        Ctrl+S 保存活动文档 — 无测试
    ├── [缺口]        Ctrl+W 关闭活动 tab — 无测试
    └── [缺口]        Ctrl+Tab 切换 tab — 无测试

[+] EditorArea (editor-area.tsx)
    ├── [缺口]        渲染所有已打开文档 — 无测试
    └── [缺口]        只有活动文档可见 — 无测试

用户流程覆盖率
===========================
[+] 文件打开流程
    ├── [★★  已测试] EditorService 创建 + 加载 — integration.test.ts
    └── [缺口]        [→E2E] 文件树点击 → 编辑器显示内容 — 无测试

[+] Tab 切换流程
    └── [缺口]        [→E2E] 打开 2 个文件 → 切换 → 内容正确 — 无测试

[+] 保存流程
    ├── [★★  已测试] AutoSaveService 注册 — integration.test.ts
    └── [缺口]        [→E2E] 编辑 → Ctrl+S → 文件更新到磁盘 — 无测试

[+] 错误状态
    ├── [缺口]        保存失败（权限拒绝）— 无测试
    └── [缺口]        文件被外部删除 — 无测试

─────────────────────────────────
覆盖率：5/22 路径已测试 (23%)
  代码路径：5/18 (28%)
  用户流程：0/4 (0%)
质量评级：  ★★★: 0  ★★: 5  ★: 0
缺口：17 条路径需要测试（2 条需要 E2E）
─────────────────────────────────
```

### 必需的新测试

| 测试 | 文件 | 类型 |
|------|------|------|
| setEditor 监听器在 destroy 中清理 | `EditorService.test.ts` | 单元 |
| 通过 registerUpdateListener 追踪 isDirty | `EditorService.test.ts` | 单元 |
| 带 mock editor + filesystem 的 saveDocument | `EditorService.test.ts` | 单元 |
| EditorContentPlugin 挂载时加载内容 | `lexical-editor.test.tsx`（新建）| 单元 |
| EditorBridgePlugin 创建服务 + 注入 editor | `lexical-editor.test.tsx`（新建）| 单元 |
| ShortcutProvider Ctrl+S 保存活动文档 | `shortcut-provider.test.tsx`（新建）| 单元 |
| EditorArea 渲染所有文档，只有活动的可见 | `editor-area.test.tsx`（新建）| 单元 |
| Tab 切换保留内容 [→E2E] | `editor-flow.test.tsx`（新建）| 集成 |
| 保存流程端到端 [→E2E] | `editor-flow.test.tsx`（新建）| 集成 |

### 回归测试（必须添加）

**关键 — 这些测试覆盖了已存在的 bug，必须添加：**

1. **Tab 切换内容回归**：打开文档 A → 切换到文档 B → 验证文档 B 内容正确 → 切回文档 A → 验证文档 A 的编辑保留
2. **Ctrl+S 保存回归**：打开文档 → 编辑 → Ctrl+S → 验证 fileSystem.writeFile 被调用且内容正确
3. **监听器泄漏回归**：打开文档 A → 切换到文档 B → 在文档 B 中输入 → 验证文档 A 的 isDirty 没有变化

---

## 性能审查

### 问题：多个 Lexical 编辑器常驻内存

**[P2] (置信度: 6/10) — 大量打开 tab 时的内存使用**

CSS 可见性切换保持所有 Lexical 编辑器挂载。每个 Lexical 编辑器持有自己的状态树。20+ 个 tab 可能占用显著内存。

缓解措施：添加 tab 上限（如最多 20 个）或实现延迟挂载（首次激活 tab 时才挂载编辑器，之后保持挂载）。目前典型使用场景（<10 个 tab）没有问题。

无其他性能问题。转换层在每次加载/保存时运行，但这是不可避免的，且 Block 模型轻量。

---

## 失败模式

| 代码路径 | 失败场景 | 有测试？ | 有错误处理？ | 用户体验 |
|----------|---------|---------|------------|---------|
| setEditor → registerUpdateListener | Lexical editor 在注册中被销毁 | 无 | 无 | 静默，isDirty 不更新 |
| loadDocument → blocksToLexical | 无效的 Block 数据 | 无 | 有（try/catch）| 错误状态 |
| saveDocument → writeFile | 权限被拒绝 | 无 | 有（try/catch）| 错误状态 |
| saveDocument → lexicalToBlocks | 编辑器处于不一致状态 | 无 | 有（try/catch）| 错误状态 |
| EditorBridgePlugin → createInstance | DI 容器未就绪 | 无 | 无 | 静默，无编辑器服务 |
| ShortcutProvider → getService | tab 关闭后 EditorService 已销毁 | 无 | 有（null 检查）| 静默 |
| **关键**：tab 切换 → 无内容加载 | EditorContentPlugin 跳过加载 | 无 | 不适用 | **静默，过期内容** |

**关键缺口：1**（tab 切换内容加载）

---

## 完成总结

- 第 0 步：范围界定 — 范围原样接受（6 个文件，0 个新类）
- 架构审查：发现 7 个问题（3 严重，2 高，2 中）— 全部已通过用户决策解决
- 代码质量审查：1 个问题（监听器泄漏）— 已解决
- 测试审查：生成覆盖率图，17 个缺口，3 个回归测试必需
- 性能审查：1 个次要问题（多 tab 内存），延后处理
- 不在范围内：已列出
- 已有代码复用：已列出
- 失败模式：1 个关键缺口已标记
- 外部意见：跳过
- 并行化：顺序实施，修改相互依赖
- 完整度评分：5/5 建议都选择了完整方案

---

## 验证步骤

1. **Tab 切换测试：** 打开 2 个文件 → 编辑文档 A → 切换到文档 B → 验证文档 B 显示自己的内容 → 切回文档 A → 验证编辑保留
2. **Ctrl+S 测试：** 打开文件 → 编辑 → Ctrl+S → 验证文件写入磁盘 → 验证内容正确
3. **监听器泄漏测试：** 打开/关闭 10 个 tab → 检查没有累积的 update listener
4. **isDirty 同步测试：** 编辑文档 → 验证 tab 显示 dirty 标记 → 保存 → 验证标记清除
5. **运行已有测试：** `pnpm test`
6. **回归测试：** 运行上面定义的 3 个关键回归测试
