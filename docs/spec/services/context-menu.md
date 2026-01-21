# Context Menu Service Implementation Plan

## 概述

为 My-KM 项目设计并实现一个受 VSCode 启发的右键菜单服务系统，支持在不同模块的不同对象上显示不同的上下文菜单内容。

## 设计目标

1. **统一服务**: 提供集中式的右键菜单管理服务
2. **上下文感知**: 根据触发位置和对象显示不同的菜单项
3. **类型安全**: 完整的 TypeScript 类型支持
4. **可扩展性**: 支持模块注册新的菜单项
5. **国际化**: 支持中英文切换
6. **性能优化**: 菜单缓存和懒加载

## 核心架构

### 三层架构

```
┌─────────────────────────────────────────┐
│         UI Integration Layer            │
│  (React Components & Hooks)             │
├─────────────────────────────────────────┤
│         Context System                  │
│  (Context Types & Data)                 │
├─────────────────────────────────────────┤
│         Service Layer                   │
│  (Registration & Execution)             │
└─────────────────────────────────────────┘
```

## 实现步骤

### 阶段 1: 核心类型定义 (Foundation)

**文件**: `apps/web/src/types/context-menu.ts`

定义完整的类型系统：

```typescript
// 菜单项类型
export type MenuItemType = 'action' | 'separator' | 'submenu' | 'checkbox' | 'radio'

// 上下文类型
export type MenuContextType =
  | 'editor'              // 编辑器区域
  | 'sidebar-files'       // 文件面板
  | 'sidebar-blank'       // 侧边栏空白区域
  | 'tab'                 // 标签页
  | 'file-tree'           // 文件树节点
  | 'folder-tree'         // 文件夹树节点

// 基础上下文
export interface MenuContext {
  type: MenuContextType
  triggerEvent: MouseEvent | React.MouseEvent
  position: { x: number; y: number }
  timestamp: number
}

// 特定上下文数据
export interface FileMenuContextData {
  filePath: string
  fileName: string
  isDirectory: boolean
}

export interface TabMenuContextData {
  tabId: string
  tabLabel: string
  canClose: boolean
}

export interface EditorMenuContextData {
  selection?: { text: string }
  cursorPosition?: { line: number; column: number }
}

// 菜单项定义
export interface MenuItem {
  id: string
  type: MenuItemType
  label: string
  icon?: string | React.ComponentType
  shortcut?: string
  disabled?: boolean | ((context: MenuContext) => boolean)
  visible?: boolean | ((context: MenuContext) => boolean)
  group?: string
  order?: number
}

export interface MenuActionItem extends MenuItem {
  type: 'action'
  action: (context: MenuContext) => void | Promise<void>
}

// 贡献点定义
export interface MenuContribution {
  id: string
  contextType: MenuContextType
  items: MenuItem[]
  priority?: number
}
```

### 阶段 2: 服务层实现 (Core Service)

**文件**: `apps/web/src/services/context-menu/context-menu-service.ts`

实现核心服务类：

```typescript
export class ContextMenuService {
  private contributions: Map<string, MenuContribution[]>
  private config: ContextMenuConfig

  // 注册菜单贡献点
  registerContribution(contribution: MenuContribution): void

  // 注销菜单贡献点
  unregisterContribution(contributionId: string): void

  // 获取指定上下文的菜单项
  getMenusForContext(contextType: MenuContextType, context?: MenuContext): MenuItem[]

  // 执行菜单项动作
  async executeAction(itemId: string, context: MenuContext): Promise<void>

  // 私有方法
  private filterMenuItems(items: MenuItem[], context?: MenuContext): MenuItem[]
  private sortMenuItems(items: MenuItem[]): MenuItem[]
}
```

**文件**: `apps/web/src/services/context-menu/index.ts`

导出单例：

```typescript
let contextMenuServiceInstance: ContextMenuService | null = null

export function getContextMenuService(): ContextMenuService {
  if (!contextMenuServiceInstance) {
    contextMenuServiceInstance = new ContextMenuService()
  }
  return contextMenuServiceInstance
}
```

### 阶段 3: Zustand Store 集成 (State Management)

**文件**: `apps/web/src/services/context-menu/context-menu.store.ts`

创建 Zustand store：

```typescript
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface ContextMenuState {
  isOpen: boolean
  position: { x: number; y: number } | null
  currentContext: MenuContext | null

  openMenu: (context: MenuContext, position: { x: number; y: number }) => void
  closeMenu: () => void
  executeAction: (itemId: string) => Promise<void>
}

export const useContextMenuStore = create<ContextMenuState>()(...)
```

### 阶段 4: React 组件实现 (UI Components)

**文件**: `apps/web/src/components/context-menu/context-menu.tsx`

主右键菜单组件：

```typescript
export function ContextMenu() {
  const { isOpen, position, currentContext, getMenusForContext, executeAction, closeMenu } =
    useContextMenuStore()

  if (!isOpen || !position) return null

  const menuItems = getMenusForContext(currentContext.type)

  return (
    <DropdownMenu.Root open={isOpen} onOpenChange={closeMenu}>
      <DropdownMenu.Trigger asChild>
        <div className="fixed inset-0 z-40" style={{ left: position.x, top: position.y }} />
      </DropdownMenu.Trigger>

      <DropdownMenu.Content>
        {menuItems.map(item => renderMenuItem(item))}
      </DropdownMenu.Content>
    </DropdownMenu.Root>
  )
}
```

**文件**: `apps/web/src/components/context-menu/menu-items/action-item.tsx`

动作菜单项组件：

```typescript
export function ActionMenuItem({ item, context, onAction }: ActionMenuItemProps) {
  const handleClick = async () => {
    await item.action(context)
    await onAction(item.id)
  }

  return (
    <DropdownMenu.Item onClick={handleClick} disabled={item.disabled}>
      {item.icon && <item.icon />}
      <span>{item.label}</span>
      {item.shortcut && <span className="ml-auto">{item.shortcut}</span>}
    </DropdownMenu.Item>
  )
}
```

### 阶段 5: React Hook 实现 (Developer Experience)

**文件**: `apps/web/src/hooks/use-context-menu.ts`

便捷 Hook：

```typescript
export function useContextMenu<TContext = any>({
  contextType,
  data,
  preventDefault = true,
}: UseContextMenuOptions<TContext>) {
  const { openMenu } = useContextMenuStore()

  const handleContextMenu = useCallback((event: MouseEvent | React.MouseEvent) => {
    if (preventDefault) event.preventDefault()

    const context: MenuContext & { data: TContext } = {
      type: contextType,
      triggerEvent: event,
      position: { x: event.clientX, y: event.clientY },
      timestamp: Date.now(),
      data,
    }

    openMenu(context, { x: event.clientX, y: event.clientY })
  }, [contextType, data, openMenu])

  return { onContextMenu: handleContextMenu }
}
```

### 阶段 6: 菜单贡献点注册 (Menu Contributions)

**文件**: `apps/web/src/lib/workspace/menu-contributions/file-menu.ts`

文件树菜单：

```typescript
export const fileMenuContribution: MenuContribution = {
  id: 'file-menu',
  contextType: 'file-tree',
  priority: 100,
  items: [
    {
      id: 'file.open',
      type: 'action',
      label: 'contextMenu.file.open',
      icon: File,
      shortcut: 'Enter',
      action: (context) => {
        const { filePath } = context.data
        // 打开文件逻辑
      },
    },
    {
      id: 'file.delete',
      type: 'action',
      label: 'contextMenu.file.delete',
      icon: Trash2,
      shortcut: '⌫',
      action: (context) => {
        // 删除文件逻辑
      },
    },
  ],
}
```

**文件**: `apps/web/src/lib/workspace/menu-contributions/tab-menu.ts`

标签页菜单：

```typescript
export const tabMenuContribution: MenuContribution = {
  id: 'tab-menu',
  contextType: 'tab',
  items: [
    {
      id: 'tab.close',
      type: 'action',
      label: 'contextMenu.tab.close',
      action: (context) => {
        const { tabId } = context.data
        // 关闭标签页
      },
    },
    {
      id: 'tab.closeOthers',
      type: 'action',
      label: 'contextMenu.tab.closeOthers',
      action: () => {
        // 关闭其他标签页
      },
    },
  ],
}
```

**文件**: `apps/web/src/lib/workspace/menu-contributions/sidebar-menu.ts`

侧边栏空白区域菜单：

```typescript
export const sidebarBlankMenuContribution: MenuContribution = {
  id: 'sidebar-blank-menu',
  contextType: 'sidebar-blank',
  items: [
    {
      id: 'sidebar.newFile',
      type: 'action',
      label: 'contextMenu.sidebar.newFile',
      icon: FilePlus,
      shortcut: '⌘N',
      action: () => {
        // 新建文件
      },
    },
    {
      id: 'sidebar.newFolder',
      type: 'action',
      label: 'contextMenu.sidebar.newFolder',
      icon: FolderPlus,
      action: () => {
        // 新建文件夹
      },
    },
  ],
}
```

**文件**: `apps/web/src/lib/workspace/menu-contributions/editor-menu.ts`

编辑器菜单：

```typescript
export const editorMenuContribution: MenuContribution = {
  id: 'editor-menu',
  contextType: 'editor',
  items: [
    {
      id: 'editor.cut',
      type: 'action',
      label: 'contextMenu.editor.cut',
      shortcut: '⌘X',
      visible: (context) => !!context.data.selection,
      action: (context) => {
        // 剪切
      },
    },
    {
      id: 'editor.copy',
      type: 'action',
      label: 'contextMenu.editor.copy',
      shortcut: '⌘C',
      action: () => {
        // 复制
      },
    },
    {
      id: 'editor.paste',
      type: 'action',
      label: 'contextMenu.editor.paste',
      shortcut: '⌘V',
      action: () => {
        // 粘贴
      },
    },
  ],
}
```

### 阶段 7: 国际化支持 (i18n)

**文件**: `apps/web/messages/en.json`

添加英文翻译：

```json
{
  "contextMenu": {
    "file": {
      "open": "Open",
      "cut": "Cut",
      "copy": "Copy",
      "delete": "Delete",
      "rename": "Rename"
    },
    "folder": {
      "newFile": "New File",
      "newFolder": "New Folder",
      "expand": "Expand",
      "collapse": "Collapse"
    },
    "tab": {
      "close": "Close",
      "closeOthers": "Close Others",
      "closeAll": "Close All"
    },
    "sidebar": {
      "newFile": "New File",
      "newFolder": "New Folder",
      "refresh": "Refresh"
    },
    "editor": {
      "cut": "Cut",
      "copy": "Copy",
      "paste": "Paste"
    }
  }
}
```

**文件**: `apps/web/messages/zh-CN.json`

添加中文翻译：

```json
{
  "contextMenu": {
    "file": {
      "open": "打开",
      "cut": "剪切",
      "copy": "复制",
      "delete": "删除",
      "rename": "重命名"
    },
    "folder": {
      "newFile": "新建文件",
      "newFolder": "新建文件夹",
      "expand": "展开",
      "collapse": "折叠"
    },
    "tab": {
      "close": "关闭",
      "closeOthers": "关闭其他",
      "closeAll": "关闭全部"
    },
    "sidebar": {
      "newFile": "新建文件",
      "newFolder": "新建文件夹",
      "refresh": "刷新"
    },
    "editor": {
      "cut": "剪切",
      "copy": "复制",
      "paste": "粘贴"
    }
  }
}
```

### 阶段 8: 组件集成示例

**示例 1: 文件树节点**

```typescript
// components/file-tree/file-tree-item.tsx
export function FileTreeItem({ filePath, fileName, isDirectory }: FileTreeItemProps) {
  const { onContextMenu } = useContextMenu<FileMenuContextData>({
    contextType: isDirectory ? 'folder-tree' : 'file-tree',
    data: { filePath, fileName, isDirectory },
  })

  return (
    <div onContextMenu={onContextMenu}>
      <span>{fileName}</span>
    </div>
  )
}
```

**示例 2: 编辑器标签页**

```typescript
// components/editor/editor-tab.tsx
export function EditorTab({ tabId, label, canClose }: EditorTabProps) {
  const { onContextMenu } = useContextMenu<TabMenuContextData>({
    contextType: 'tab',
    data: { tabId, tabLabel: label, canClose },
  })

  return (
    <div onContextMenu={onContextMenu}>
      <span>{label}</span>
    </div>
  )
}
```

**示例 3: 编辑器区域**

```typescript
// components/editor/editor-area.tsx
export function EditorArea() {
  const { onContextMenu } = useContextMenu<EditorMenuContextData>({
    contextType: 'editor',
    data: { /* selection, cursorPosition */ },
  })

  return (
    <div onContextMenu={onContextMenu}>
      {/* 编辑器内容 */}
    </div>
  )
}
```

**示例 4: 侧边栏空白区域**

```typescript
// components/sidebar/sidebar-panel.tsx
export function SidebarPanel() {
  const { onContextMenu } = useContextMenu({
    contextType: 'sidebar-blank',
  })

  return (
    <div onContextMenu={onContextMenu}>
      {/* 文件树内容 */}
    </div>
  )
}
```

### 阶段 9: 初始化

**文件**: `apps/web/src/app/[locale]/workspace/layout.tsx` 或 `_app.tsx`

```typescript
import { useEffect } from 'react'
import { ContextMenu } from '@/components/context-menu'
import { registerFileMenus } from '@/lib/workspace/menu-contributions/file-menu'
import { registerTabMenus } from '@/lib/workspace/menu-contributions/tab-menu'
import { registerSidebarMenus } from '@/lib/workspace/menu-contributions/sidebar-menu'
import { registerEditorMenus } from '@/lib/workspace/menu-contributions/editor-menu'

export default function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    // 注册所有菜单贡献点
    registerFileMenus()
    registerTabMenus()
    registerSidebarMenus()
    registerEditorMenus()
  }, [])

  return (
    <>
      {children}
      <ContextMenu />
    </>
  )
}
```

## 文件结构

```
apps/web/src/
├── types/
│   └── context-menu.ts                          # 核心类型定义
│
├── services/
│   └── context-menu/
│       ├── context-menu-service.ts             # 服务类
│       ├── context-menu.store.ts               # Zustand store
│       └── index.ts                            # 公开 API
│
├── components/
│   └── context-menu/
│       ├── context-menu.tsx                    # 主菜单组件
│       └── menu-items/
│           ├── action-item.tsx                 # 动作项
│           ├── submenu-item.tsx                # 子菜单
│           ├── checkbox-item.tsx               # 复选框项
│           ├── radio-item.tsx                  # 单选项
│           └── separator.tsx                   # 分隔符
│
├── hooks/
│   └── use-context-menu.ts                     # React Hook
│
├── lib/
│   └── workspace/
│       └── menu-contributions/
│           ├── file-menu.ts                    # 文件菜单
│           ├── tab-menu.ts                     # 标签页菜单
│           ├── sidebar-menu.ts                 # 侧边栏菜单
│           ├── editor-menu.ts                  # 编辑器菜单
│           └── index.ts                        # 统一导出
│
└── messages/
    ├── en.json                                 # 英文翻译
    └── zh-CN.json                              # 中文翻译
```

## 关键文件

必须创建的核心文件（按优先级）：

1. **apps/web/src/types/context-menu.ts** - 类型定义（整个系统的基础）
2. **apps/web/src/services/context-menu/context-menu-service.ts** - 服务类
3. **apps/web/src/services/context-menu/context-menu.store.ts** - 状态管理
4. **apps/web/src/components/context-menu/context-menu.tsx** - UI 组件
5. **apps/web/src/hooks/use-context-menu.ts** - React Hook
6. **apps/web/src/lib/workspace/menu-contributions/file-menu.ts** - 文件菜单示例
7. **apps/web/src/lib/workspace/menu-contributions/tab-menu.ts** - 标签页菜单示例

## 测试计划

### 单元测试

- 测试服务类的注册、注销功能
- 测试菜单项过滤和排序
- 测试条件可见性逻辑
- 测试动作执行

### 集成测试

- 测试右键菜单在不同上下文中的显示
- 测试菜单项点击和动作执行
- 测试键盘快捷键
- 测试国际化切换

### 手动测试场景

1. **文件树右键**:
   - 在文件上右键，应显示"打开"、"删除"、"复制"等
   - 在文件夹上右键，应显示"新建文件"、"新建文件夹"等

2. **标签页右键**:
   - 在可关闭标签页上右键，应显示"关闭"、"关闭其他"
   - 在不可关闭标签页上右键，关闭选项应被禁用

3. **编辑器区域右键**:
   - 有选中文本时，应显示"剪切"、"复制"
   - 无选中文本时，这些选项应被禁用或隐藏

4. **侧边栏空白区域右键**:
   - 应显示"新建文件"、"新建文件夹"、"刷新"等

## 验收标准

### 功能性

- ✅ 在不同模块不同对象上右键显示不同菜单
- ✅ 菜单项支持图标、快捷键显示
- ✅ 支持菜单项条件显示/禁用
- ✅ 支持子菜单
- ✅ 点击菜单项执行对应动作
- ✅ 点击外部区域关闭菜单
- ✅ ESC 键关闭菜单

### 非功能性

- ✅ TypeScript 类型安全
- ✅ 性能优化（菜单缓存）
- ✅ 国际化支持（中英文）
- ✅ 键盘导航支持
- ✅ 无障碍访问（ARIA 属性）
- ✅ 响应式设计

### 可扩展性

- ✅ 新模块可轻松注册菜单项
- ✅ 不需要修改核心代码
- ✅ 支持动态菜单生成
- ✅ 支持菜单优先级控制

## 实施注意事项

1. **遵循现有模式**: 使用项目中已有的 Zustand、Radix UI、shadcn/ui 模式
2. **类型安全优先**: 所有 API 都要有完整的 TypeScript 类型
3. **渐进式实现**: 先实现基础功能，再添加高级特性
4. **测试驱动**: 为核心服务类编写单元测试
5. **文档完善**: 添加 JSDoc 注释和使用示例

## VSCode 设计参考

本设计借鉴了 VSCode 的以下概念：

- **Contribution Points**: 允许模块注册菜单项
- **Context Key**: 上下文条件表达式（如 `editorHasSelection`）
- **Menu Groups**: 相关菜单项的分组显示
- **Priority System**: 控制菜单项显示顺序
- **Condition Expression**: 菜单项可见性/启用状态的条件判断

## 实施顺序建议

1. **第一批次（核心功能）**:
   - 类型定义
   - 服务类
   - Zustand store
   - 基础 UI 组件
   - use-context-menu Hook

2. **第二批次（菜单贡献）**:
   - 文件树菜单
   - 标签页菜单
   - 侧边栏菜单
   - 编辑器菜单

3. **第三批次（增强功能）**:
   - 国际化
   - 键盘快捷键
   - 子菜单支持
   - 性能优化

4. **第四批次（完善）**:
   - 单元测试
   - 文档
   - 示例代码
