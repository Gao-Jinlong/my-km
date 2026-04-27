# Editor Refactoring Plan — Lexical Plugin Architecture

## 概述
将编辑器的工具栏和状态栏重构为 Lexical 插件，遵循官方 Lexical playground 的最佳实践。工具栏 UI 保持分离，状态栏使用独立 store 避免高频更新污染 EditorState。

## 架构设计

### 最终数据流图

```
┌─────────────────────────────────────────────────────────────────────┐
│  LexicalExtensionComposer (per document, keyed by doc.id)           │
│                                                                     │
│  ┌─ ToolbarPlugin ────────────────────────────────────────────┐    │
│  │  • useLexicalComposerContext() → editor                    │    │
│  │  • registerUpdateListener() → sync formatState (NOT SELE..)│    │
│  │  • active check: skip if !activeDocId                       │    │
│  │  • 渲染: <Toolbar formatState={...} editor={editor} />      │    │
│  │  • Toolbar 组件通过 dispatchCommand 发送格式命令             │    │
│  └────────────────────────────────────────────────────────────┘    │
│                                                                     │
│  ┌─ StatusBarPlugin ──────────────────────────────────────────┐    │
│  │  • useLexicalComposerContext() → editor                    │    │
│  │  • registerUpdateListener() → RAF throttled                │    │
│  │  • active check: skip if !activeDocId                       │    │
│  │  • $getRoot() → 光标块索引/偏移 + 总字数                     │    │
│  │  • statusBarStore.setState({ cursorLine, cursorCol, count })│    │
│  │  • 渲染: null (纯数据同步)                                   │    │
│  └────────────────────────────────────────────────────────────┘    │
│                                                                     │
│  ┌─ EditorBridgePlugin ───────────────────────────────────────┐    │
│  │  • 创建/获取 EditorService 实例                              │    │
│  │  • editorService.setEditor(editor)                          │    │
│  │  • AutoSaveService.register(documentId, editorService)      │    │
│  │  • 渲染: null                                                │    │
│  └────────────────────────────────────────────────────────────┘    │
│                                                                     │
│  ┌─ EditorContentPlugin ──────────────────────────────────────┐    │
│  │  • 自动聚焦到编辑器末尾                                       │    │
│  │  • 监听 onDidChangeActive → 切换 tab 时聚焦                  │    │
│  │  • 渲染: null                                                │    │
│  └────────────────────────────────────────────────────────────┘    │
│                                                                     │
│  ┌─ EditorPlaceholder ────────────────────────────────────────┐    │
│  │  • useLexicalIsTextContentEmpty → 空内容时显示占位文本        │    │
│  └────────────────────────────────────────────────────────────┘    │
│                                                                     │
│  ┌─ ContentEditable ──────────────────────────────────────────┐    │
│  │  • Lexical 编辑区域                                          │    │
│  │  • onContextMenu → ContextMenuService                       │    │
│  └────────────────────────────────────────────────────────────┘    │
└────────────────────────────────────────────────────────────────────┘

┌─ EditorRoot ───────────────────────────────────────────────────────┐
│  • EditorShell (flex 布局容器)                                      │
│  │  └── LexicalEditor ← 完整编辑器 (toolbar + content + plugins)   │
│  └── DocumentStatusIndicator (absolute 定位，右上角)                │
└────────────────────────────────────────────────────────────────────┘

┌─ WorkspaceContent ─────────────────────────────────────────────────┐
│  • EditorArea (上面的 EditorRoot)                                  │
│  • StatusBar → useStatusBarState(activeDocId) 从独立 store 读取    │
└────────────────────────────────────────────────────────────────────┘

┌─ statusBarStore (独立 store) ──────────────────────────────────────┐
│  • apps/web/src/stores/status-bar-store.ts                         │
│  • useSyncExternalStore based                                      │
│  • statusBarStore.setState(docId, { cursorLine, cursorCol, count }) │
│  • export useStatusBarState(docId)                                 │
└────────────────────────────────────────────────────────────────────┘
```

### 关键决策（已确认）

1. **ToolbarPlugin 放在 composer 内部** — 使用 `useLexicalComposerContext()` 直接访问 editor
2. **Toolbar UI 保持分离** — `toolbar.tsx` 保留为纯 UI 组件，`ToolbarPlugin` 做数据桥接
3. **StatusBarPlugin 使用独立 store** — 高频光标更新不经过 EditorState
4. **StatusBarPlugin RAF 节流** — 保证每秒最多计算 60 次
5. **active check** — 非活跃文档的插件跳过状态计算
6. **registerUpdateListener (NOT SELECTION_CHANGE)** — 格式状态需要在每次 update 时同步
7. **LexicalEditor 作为完整编辑器根** — 包含 toolbar + content + 所有 plugins
8. **LexicalExtensionComposer 不需要重写** — 只需添加插件作为子元素
9. **`mergeRegister` 管理生命周期** — Lexical 官方推荐的生命周期管理方式

## 实施步骤

### Step 1: 创建独立 StatusBarStore
**新文件**: `apps/web/src/stores/status-bar-store.ts`

```typescript
'use client';

import { useSyncExternalStore } from 'react';

export interface StatusBarState {
    cursorLine: number;
    cursorCol: number;
    charCount: number;
}

let states: Map<string, StatusBarState> = new Map();
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

export function setStatusBarState(documentId: string, state: StatusBarState) {
    states = new Map(states);
    states.set(documentId, state);
    for (const l of listeners) l();
}

function getSnapshot() { return states; }

export function useStatusBarState(documentId: string | null): StatusBarState | null {
    const allStates = useSyncExternalStore(subscribe, getSnapshot, () => new Map());
    if (!documentId) return null;
    return allStates.get(documentId) ?? null;
}
```

设计要点：
- 与 `use-editor-service-state.ts` 相同的 useSyncExternalStore 模式
- 独立模块，不依赖 EditorService
- 高频更新只触发 StatusBar 组件重渲染

### Step 2: 创建 plugins/ 目录和 ToolbarPlugin
**新文件**: `apps/web/src/components/workspace/editor/plugins/ToolbarPlugin.tsx`
**新文件**: `apps/web/src/components/workspace/editor/plugins/index.ts`

ToolbarPlugin 作为数据桥接，把 formatState 传给现有的 `Toolbar` 组件：

```tsx
'use client';

import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { $getSelection, $isRangeSelection } from 'lexical';
import { useEffect, useState } from 'react';
import { EditorTabService } from '@/platform/editor-tab/service';
import { getContainer } from '@/platform/bootstrap';
import type { FormatState } from '@/features/editor/types';
import { Toolbar } from '../toolbar';

function createEmptyFormatState(): FormatState {
    return { bold: false, italic: false, underline: false, code: false, strikethrough: false, subscript: false, superscript: false, highlight: false };
}

export function ToolbarPlugin({ documentId }: { documentId: string }) {
    const [editor] = useLexicalComposerContext();
    const [formatState, setFormatState] = useState<FormatState>(createEmptyFormatState);
    const editorTabService = getContainer().get(EditorTabService);
    const activeDocId = editorTabService.getActiveDocumentId();

    useEffect(() => {
        const unregister = editor.registerUpdateListener(({ editorState }) => {
            // 非活跃文档跳过
            if (documentId !== activeDocId) return;

            editorState.read(() => {
                const selection = $getSelection();
                if ($isRangeSelection(selection)) {
                    setFormatState({
                        bold: selection.hasFormat('bold'),
                        italic: selection.hasFormat('italic'),
                        underline: selection.hasFormat('underline'),
                        strikethrough: selection.hasFormat('strikethrough'),
                        code: selection.hasFormat('code'),
                        highlight: selection.hasFormat('highlight'),
                        subscript: selection.hasFormat('subscript'),
                        superscript: selection.hasFormat('superscript'),
                    });
                }
            });
        });
        return unregister;
    }, [editor, documentId, activeDocId]);

    return <Toolbar editor={editor} formatState={formatState} />;
}
```

关键设计：
- 不合并 UI，直接调用现有的 `<Toolbar>` 组件
- `registerUpdateListener`（NOT SELECTION_CHANGE），因为格式状态需要在每次 update 时同步
- active check 跳过非活跃文档

### Step 3: 创建 StatusBarPlugin
**新文件**: `apps/web/src/components/workspace/editor/plugins/StatusBarPlugin.tsx`

```tsx
'use client';

import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { $getRoot, $getSelection, $isRangeSelection } from 'lexical';
import { useEffect, useRef } from 'react';
import { EditorTabService } from '@/platform/editor-tab/service';
import { getContainer } from '@/platform/bootstrap';
import { setStatusBarState } from '@/stores/status-bar-store';

export function StatusBarPlugin({ documentId }: { documentId: string }) {
    const [editor] = useLexicalComposerContext();
    const rafIdRef = useRef<number | null>(null);
    const editorTabService = getContainer().get(EditorTabService);
    const activeDocId = editorTabService.getActiveDocumentId();

    useEffect(() => {
        const unregister = editor.registerUpdateListener(() => {
            // 非活跃文档跳过
            if (documentId !== activeDocId) return;
            // RAF 节流
            if (rafIdRef.current !== null) return;

            rafIdRef.current = requestAnimationFrame(() => {
                editor.read(() => {
                    const root = $getRoot();
                    const selection = $getSelection();

                    // 光标位置: 块索引 + 块内偏移
                    let cursorLine = 1;
                    let cursorCol = 1;
                    if ($isRangeSelection(selection)) {
                        const anchor = selection.anchor;
                        const anchorNode = anchor.getNode();
                        const parent = anchorNode.getParent();
                        const blocks = root.getChildren();
                        // 找到光标所在块的索引
                        for (let i = 0; i < blocks.length; i++) {
                            if (blocks[i] === parent || blocks[i] === anchorNode) {
                                cursorLine = i + 1;
                                break;
                            }
                        }
                        // 块内偏移
                        cursorCol = anchor.offset + 1; // 1-based
                    }

                    // 字数
                    const charCount = root.getTextContent().length;

                    setStatusBarState(documentId, { cursorLine, cursorCol, charCount });
                });
                rafIdRef.current = null;
            });
        });

        return () => {
            unregister();
            if (rafIdRef.current !== null) cancelAnimationFrame(rafIdRef.current);
        };
    }, [editor, documentId, activeDocId]);

    return null;
}
```

### Step 4: 更新 EditorBridgePlugin 注册 AutoSaveService
**文件**: `apps/web/src/components/workspace/editor/lexical-editor.tsx`

在 `EditorBridgePlugin` 中：
```tsx
useEffect(() => {
    const editorContainer = getContainer().get(EditorContainer);
    let editorService = editorContainer.getService(documentId);
    if (!editorService) {
        editorService = editorContainer.createInstance(documentId, filePath);
    }
    editorService.setEditor(editor);

    // 注册自动保存
    const autoSaveService = getContainer().get(AutoSaveService);
    autoSaveService.register(documentId, editorService);

    return () => {
        autoSaveService.unregister(documentId);
    };
}, [documentId, filePath, editor]);
```

### Step 5: 更新 lexical-editor.tsx（增量修改，非重写）
**文件**: `apps/web/src/components/workspace/editor/lexical-editor.tsx`

在 `LexicalEditorImpl` 的 `LexicalExtensionComposer` 内部添加：
- `<ToolbarPlugin documentId={documentId} />` — 在 ContentEditable 上方
- `<StatusBarPlugin documentId={documentId} />` — 功能插件
- 更新 `EditorBridgePlugin` 的 cleanup 逻辑

布局结构：
```tsx
<LexicalExtensionComposer extension={rootExtension} contentEditable={null}>
    <div className="relative flex h-full flex-col">
        {/* ToolbarPlugin - 工具栏在 composer 内部 */}
        <ToolbarPlugin documentId={documentId} />

        {/* 编辑区域 */}
        <div className="flex-1 overflow-y-auto">
            <div className="mx-auto max-w-200 px-4 py-6">
                <ContentEditable className="..." onContextMenu={...} />
            </div>
        </div>

        <EditorPlaceholder content={placeholder} />
    </div>

    {/* 功能插件 (渲染 null) */}
    <StatusBarPlugin documentId={documentId} />
    <EditorBridgePlugin documentId={documentId} filePath={filePath} />
    <EditorContentPlugin documentId={documentId} />
</LexicalExtensionComposer>
```

### Step 6: 简化 editor-root.tsx
**文件**: `apps/web/src/components/workspace/editor/editor-root.tsx`

删除工具栏占位符：
```tsx
export function EditorRoot({ documentId, className }: EditorRootProps) {
    return (
        <EditorShell className={className}>
            {/* 内容区域 - LexicalEditor 包含 toolbar + content */}
            <ContentArea documentId={documentId} />
            {/* 文档状态指示器 - 右上角浮动 */}
            <div className="absolute top-2 right-2 z-10">
                <DocumentStatusIndicator documentId={documentId} />
            </div>
        </EditorShell>
    );
}
```

### Step 7: 更新 StatusBar 组件
**文件**: `apps/web/src/components/workspace/status-bar.tsx`

```tsx
'use client';

import { Bell } from 'lucide-react';
import { useEditorTabs } from '@/platform/editor-tab/use-editor-tabs';
import { useStatusBarState } from '@/stores/status-bar-store';

export function StatusBar() {
    const { activeDocumentId } = useEditorTabs();
    const statusBar = useStatusBarState(activeDocumentId);

    return (
        <div className="flex h-[22px] w-full shrink-0 items-center justify-between border-t bg-ws-bg-primary px-3 text-[11px] text-ws-fg-muted">
            <div className="flex items-center gap-3">
                <span>第 {statusBar?.cursorLine ?? 1} 行，第 {statusBar?.cursorCol ?? 1} 列</span>
                <span>{statusBar?.charCount ?? 0} 字</span>
            </div>
            <div className="flex items-center gap-4">
                <span>UTF-8</span>
                <span>.km</span>
                <Bell className="h-3.5 w-3.5 cursor-pointer text-ws-icon hover:text-ws-fg-primary" />
            </div>
        </div>
    );
}
```

### Step 8: 更新 barrel exports
**文件**: `apps/web/src/components/workspace/editor/index.ts`
- 保留 `Toolbar` 导出
- 新增 `ToolbarPlugin`, `StatusBarPlugin` 导出
- 新增 `plugins/` barrel export

### Step 9: 删除 toolbar-plugin.tsx
**文件**: `apps/web/src/components/workspace/editor/toolbar-plugin.tsx`
- 删除（监听逻辑已合并到 ToolbarPlugin）
- `toggleFormat` 函数保留或移到 `toolbar.tsx`

## 文件变更总结

| 文件 | 操作 | 说明 |
|------|------|------|
| `stores/status-bar-store.ts` | **新建** | 独立 store for status bar data |
| `components/.../plugins/ToolbarPlugin.tsx` | **新建** | 数据桥接: listener → formatState → Toolbar |
| `components/.../plugins/StatusBarPlugin.tsx` | **新建** | RAF 节流光标计算 → statusBarStore |
| `components/.../plugins/index.ts` | **新建** | 插件 barrel export |
| `components/.../lexical-editor.tsx` | **修改** | 添加 ToolbarPlugin + StatusBarPlugin 到 composer |
| `components/.../editor-root.tsx` | **修改** | 删除工具栏占位符 |
| `components/.../toolbar-plugin.tsx` | **删除** | 监听已合并到 ToolbarPlugin |
| `components/workspace/status-bar.tsx` | **修改** | 从硬编码改为 statusBarStore 读取 |
| `components/.../index.ts` | **修改** | 更新 barrel exports |

## Outside Voice Findings

| # | Issue | Resolution |
|---|-------|-----------|
| 1 | Toolbar 应该保持 UI/Plugin 分离 | **已采纳** — 保留 toolbar.tsx，ToolbarPlugin 做桥接 |
| 2 | EditorRoot 和 LexicalEditor 关系不明确 | **已解决** — LexicalEditor 作为完整根 |
| 3 | SELECTION_CHANGE vs registerUpdateListener | **已采纳** — 保持 registerUpdateListener |
| 4 | 光标位置"行号"语义模糊 | **已解决** — 块索引方案，已明确 |
| 5 | LexicalExtensionComposer 不需要"重写" | **已采纳** — 改为增量添加插件 |
| 6 | AutoSaveService 注册时机 | **已解决** — EditorBridgePlugin 内部注册 |
| 7 | useEditorServiceState 高频更新性能 | **已采纳** — 使用独立 statusBarStore |
| 8 | 隐藏 composer 监听器仍然工作 | **已采纳** — active check 模式 |

## 风险点

1. **StatusBarPlugin RAF 节流** — requestAnimationFrame 可能在隐藏 tab 中暂停，但这是期望行为
2. **AutoSaveService 重复注册** — 确保 EditorBridgePlugin cleanup 正确
3. **active check 依赖 EditorTabService** — 需要确保 EditorTabService.getActiveDocumentId() 可用

## 测试策略

### 测试覆盖图

```
CODE PATHS                                            USER FLOWS
[+] ToolbarPlugin                                     [+] 格式按钮操作
  ├── 渲染 Toolbar 组件                                ├── [GAP] 点击粗体按钮 → 按钮高亮
  │   └── [GAP] formatState 传递给 Toolbar             ├── [GAP] 点击粗体 → 文本变粗
  ├── registerUpdateListener                           └── [GAP] 按 Ctrl+B → 格式切换
  │   ├── [GAP] active check → skip if not active
  │   └── [GAP] 选区变化 → setFormatState             [+] 状态栏显示
  └── Toolbar 按钮点击                                 ├── [GAP] 输入文本 → 字数更新
      └── [GAP] dispatchCommand(FORMAT_TEXT_COMMAND)   ├── [GAP] 移动光标 → 位置更新
                                                        └── [GAP] 切换 tab → 状态栏更新
[+] StatusBarPlugin
  ├── registerUpdateListener (RAF throttled)
  │   ├── [GAP] active check → skip if not active
  │   ├── [GAP] 空文档 → cursorLine=1, cursorCol=1, charCount=0
  │   ├── [GAP] 有选区 → 正确计算
  │   └── [GAP] RAF → 快速输入不重复计算
  └── setStatusBarState
      └── [GAP] 调用 → statusBarStore 更新

[+] statusBarStore
  ├── setStatusBarState
  │   └── [GAP] 调用 → listeners 通知
  └── useStatusBarState
      ├── [GAP] 无文档 → null
      └── [GAP] 有状态 → 返回 StatusBarState

COVERAGE: 0/14 paths tested (0%)  |  Code paths: 0/8  |  User flows: 0/6
QUALITY: ★★★:0 ★★:0 ★:0  |  GAPS: 14 (all new code)
```

### 测试文件计划

1. **`stores/__tests__/status-bar-store.test.ts`** — statusBarStore 单元测试
2. **`components/.../plugins/__tests__/ToolbarPlugin.test.tsx`** — ToolbarPlugin 渲染 + listener
3. **`components/.../plugins/__tests__/StatusBarPlugin.test.tsx`** — StatusBarPlugin 计算 + RAF
4. **`components/.../__tests__/toolbar.test.tsx`** — 现有 Toolbar 组件测试

## NOT in scope

- 块级格式按钮（标题、列表、引用等）— 现有 TODO，留到下次
- 浮动工具栏（选区弹出）— 不在当前需求范围内
- 撤销/重做的 UI 按钮 — Lexical HistoryExtension 已处理，无 UI

## What already exists

| 组件 | 状态 | 本次处理 |
|------|------|---------|
| `toolbar.tsx` | 完整 UI 组件，接收 editor + formatState props | **保留**，由 ToolbarPlugin 调用 |
| `toolbar-plugin.tsx` | 监听器，但没有 UI，格式状态更新 TODO | **删除**，逻辑合并到 ToolbarPlugin |
| `DocumentStatusIndicator` | 已通过 useEditorServiceState 连接 | **保留**，不需要修改 |
| `EditorBridgePlugin` | 已注入 Lexical 到 EditorService | **修改**，添加 AutoSaveService 注册 |
| `EditorContentPlugin` | 已实现聚焦逻辑 | **保留**，不需要修改 |
| `status-bar.tsx` | 硬编码静态内容 | **重写**，改为订阅 statusBarStore |
| `use-editor-service-state.ts` | EditorState store | **保持不变**，状态栏用新 store |
