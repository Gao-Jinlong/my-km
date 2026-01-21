# 文件夹面板

## 📋 文档信息

- **所属模块**: Sidebar
- **子模块**: Files Panel (文件夹面板)
- **版本**: 2.0.0
- **创建日期**: 2026-01-20
- **最后更新**: 2026-01-21
- **状态**: ✅ 需求定义完成

---

## 🎯 模块概述

文件夹面板是左侧侧边栏的默认激活面板,以树形结构展示当前项目的所有文件和文件夹,提供文件浏览、管理和操作功能。

### 核心价值

1. **直观的文件浏览**: 树形结构清晰展示项目文件层次
2. **高效的文件操作**: 展开/折叠、拖拽移动、右键菜单等便捷操作
3. **智能文件识别**: 根据文件类型显示对应图标
4. **快速定位**: 支持键盘导航和搜索过滤

### 界面布局

```
┌─────────────────────────────────┐
│ [Files] [Search] [+]           │ ← Tab 切换栏
├─────────────────────────────────┤
│ 📁 project-root/               │
│   ├─ 📁 src/                   │
│   │   ├─ 📁 components/        │
│   │   │   └─ 📄 Button.tsx    │
│   │   └─ 📄 App.tsx           │
│   ├─ 📁 docs/                  │
│   │   └─ 📄 README.md         │
│   └─ 📄 package.json           │
│                                 │
│ ← 可滚动区域                    │
├─────────────────────────────────┤
│  [⚙️]  [👤]                    │ ← 底部操作区
└─────────────────────────────────┘
```

---

## 📖 功能需求

### WV-LS-FP-FR-1: 文件树展示

**优先级**: MUST

**描述**:
以树形结构递归展示项目目录下的所有文件和文件夹,支持展开和折叠操作。

**功能详情**:

1. **树形结构**
   - 递归展示文件夹层次关系
   - 使用缩进表示层级关系
   - 显示文件夹和文件的包含关系

2. **展开/折叠**
   - 点击文件夹图标或名称展开/折叠
   - 展开/折叠状态独立保存
   - 支持快捷键操作 (←/→ 箭头键)

3. **滚动性能**
   - 虚拟滚动优化大型项目
   - 懒加载子目录内容
   - 滚动位置记忆

4. **初始状态**
   - 默认展开根目录
   - 其他文件夹默认折叠
   - 自动滚动到当前打开的文件

**验收标准**:
- [ ] 树形结构正确显示所有文件和文件夹
- [ ] 缩进层级关系清晰
- [ ] 点击文件夹可以展开/折叠
- [ ] 展开/折叠状态独立保存
- [ ] 大型项目 (1000+ 文件) 性能流畅
- [ ] 滚动位置记忆功能正常

**实施状态**: ⏳ 待实现

---

### WV-LS-FP-FR-2: 文件类型图标

**优先级**: MUST

**描述**:
根据文件类型显示对应的图标,提升视觉识别度。

**图标映射表**:

| 文件类型 | 扩展名 | 图标 (Lucide) | 颜色 |
|---------|--------|---------------|------|
| 文件夹 | - | Folder / FolderOpen | #E8B876 |
| Markdown | .md, .markdown | FileText | #083fa1 |
| 图片 | .png, .jpg, .svg, .gif | FileImage | #a039cf |
| 代码 | .ts, .tsx, .js, .jsx | FileCode | #f1e05a |
| 样式 | .css, .scss, .less | FileCode | #563d7c |
| 配置 | .json, .yaml, .toml | Settings | #6a9955 |
| PDF | .pdf | File | #d32f2f |
| 默认 | * | File | #6e6e6e |

**验收标准**:
- [ ] 不同文件类型显示正确的图标
- [ ] 图标颜色符合设计规范
- [ ] 文件夹展开/折叠图标不同
- [ ] 图标尺寸统一 (16x16px)

**实施状态**: ⏳ 待实现

---

### WV-LS-FP-FR-3: 拖拽移动文件

**优先级**: SHOULD

**描述**:
支持拖拽文件或文件夹到其他位置,实现文件的移动和复制操作。

**功能详情**:

1. **拖拽行为**
   - 鼠标按下文件/文件夹开始拖拽
   - 拖拽时显示半透明预览
   - 目标文件夹高亮显示

2. **移动操作**
   - 拖拽到目标文件夹释放
   - 移动整个文件夹及其内容
   - 更新文件系统路径

3. **视觉反馈**
   - 拖拽时文件跟随鼠标
   - 目标文件夹背景高亮
   - 不允许拖拽到父文件夹或自身

4. **确认机制**
   - 移动文件前显示确认对话框
   - 显示移动操作的详细信息
   - 支持批量移动确认

**验收标准**:
- [ ] 可以拖拽文件到其他文件夹
- [ ] 可以拖拽文件夹到其他位置
- [ ] 拖拽时有清晰的视觉反馈
- [ ] 不允许无效的拖拽操作
- [ ] 移动前显示确认对话框
- [ ] 移动操作正确更新文件系统

**实施状态**: ⏳ 待实现

---

### WV-LS-FP-FR-4: 右键上下文菜单

**优先级**: MUST

**描述**:
右键点击文件或文件夹显示上下文菜单,提供常用的文件操作功能。

**菜单选项**:

**文件菜单**:
- 打开 (Open)
- 在新标签中打开 (Open in New Tab)
- 重命名 (Rename)
- 删除 (Delete)
- 复制路径 (Copy Path)
- 复制相对路径 (Copy Relative Path)
- 复制 (Copy)
- 粘贴 (Paste)
- - - (分割线)
- 显示在文件夹中 (Reveal in Finder/Explorer)

**文件夹菜单**:
- 展开 (Expand)
- 折叠 (Collapse)
- 全部折叠 (Collapse All)
- - - (分割线)
- 新建文件 (New File)
- 新建文件夹 (New Folder)
- - - (分割线)
- 重命名 (Rename)
- 删除 (Delete)
- 复制路径 (Copy Path)

**验收标准**:
- [ ] 右键点击文件显示文件菜单
- [ ] 右键点击文件夹显示文件夹菜单
- [ ] 菜单选项根据上下文正确显示
- [ ] 点击菜单外部自动关闭
- [ ] 所有菜单功能正常工作
- [ ] 菜单样式符合设计规范

**实施状态**: ⏳ 待实现

---

### WV-LS-FP-FR-5: 键盘导航

**优先级**: SHOULD

**描述**:
支持键盘快捷键导航文件树,提升操作效率。

**快捷键列表**:

| 快捷键 | 功能 |
|--------|------|
| ↑ / ↓ | 上移/下移选中项 |
| ← | 折叠当前文件夹或移到父级 |
| → | 展开当前文件夹或移到子级 |
| Enter | 打开文件/展开文件夹 |
| Space | 切换展开/折叠 |
| Delete | 删除选中项 |
| F2 | 重命名 |
| Cmd/Ctrl + C | 复制 |
| Cmd/Ctrl + V | 粘贴 |
| Cmd/Ctrl + X | 剪切 |

**验收标准**:
- [ ] 支持所有列出的快捷键
- [ ] 快捷键操作流畅无延迟
- [ ] 选中项有清晰的视觉反馈
- [ ] 焦点管理正确

**实施状态**: ⏳ 待实现

---

### WV-LS-FP-FR-6: 文件过滤和搜索

**优先级**: SHOULD

**描述**:
在文件树顶部提供搜索框,支持快速过滤和定位文件。

**功能详情**:

1. **实时过滤**
   - 输入关键词实时过滤文件
   - 高亮匹配的文件名
   - 自动展开包含匹配文件的文件夹

2. **搜索方式**
   - 文件名模糊匹配
   - 支持通配符 (*, ?)
   - 大小写不敏感

3. **快捷操作**
   - Cmd/Ctrl + F 聚焦搜索框
   - Esc 清空搜索
   - ↑/↓ 在结果间导航

**验收标准**:
- [ ] 顶部显示搜索框
- [ ] 输入关键词实时过滤
- [ ] 匹配的文件名高亮显示
- [ ] 自动展开包含匹配文件的文件夹
- [ ] 支持快捷键操作

**实施状态**: ⏳ 待实现

---

## 💾 数据结构设计

### 文件树节点

```typescript
interface FileTreeNode {
  id: string;                    // 唯一标识 (路径)
  name: string;                  // 文件/文件夹名称
  path: string;                  // 完整路径
  type: 'file' | 'folder';       // 类型
  extension?: string;            // 文件扩展名
  icon: string;                  // 图标名称
  color: string;                 // 图标颜色
  children?: FileTreeNode[];     // 子节点 (仅文件夹)
  isExpanded?: boolean;          // 是否展开
  isSelected?: boolean;          // 是否选中
  level: number;                 // 层级深度
}

// 文件树状态
interface FileTreeState {
  nodes: FileTreeNode[];          // 文件树节点列表
  expandedFolders: Set<string>;   // 展开的文件夹路径集合
  selectedFile: string | null;    // 当前选中的文件路径
  scrollPosition: number;         // 滚动位置
  filterQuery: string;            // 过滤关键词
}
```

### 文件操作上下文

```typescript
interface FileOperationContext {
  operation: 'copy' | 'cut' | 'paste' | 'delete' | 'rename';
  sourcePath?: string;            // 源文件路径
  targetPath?: string;            // 目标路径
  clipboard?: {
    type: 'copy' | 'cut';
    items: string[];              // 剪贴板中的文件路径
  };
}
```

---

## 🔧 技术实现要点

### 组件结构

```
components/workspace/sidebar/panels/
└── files-panel/
    ├── files-panel.tsx           # 主容器
    ├── file-tree.tsx             # 文件树组件
    ├── file-tree-node.tsx        # 树节点组件
    ├── file-search.tsx           # 文件搜索组件
    ├── context-menu.tsx          # 右键菜单
    └── file-icons.tsx            # 文件图标映射
```

### 关键技术

1. **虚拟滚动**: 使用 `react-window` 或 `react-virtual`
   ```typescript
   import { FixedSizeList } from 'react-window';
   ```

2. **拖拽操作**: 使用 `@dnd-kit/core`
   ```typescript
   import { useDraggable, useDroppable } from '@dnd-kit/core';
   ```

3. **右键菜单**: 使用 `@radix-ui/react-context-menu`
   ```typescript
   import { ContextMenuTrigger, ContextMenuContent } from '@radix-ui/react-context-menu';
   ```

4. **文件系统**: 调用文件系统模块 API
   ```typescript
   import { fileSystemAPI } from '@/lib/api/filesystem';
   ```

### 性能优化

1. **懒加载**: 文件夹内容按需加载
   ```typescript
   const loadFolderContents = async (path: string) => {
     // 只在展开时加载子节点
   };
   ```

2. **虚拟滚动**: 大型项目只渲染可见节点
   ```typescript
   const Row = ({ index, style }) => (
     <div style={style}>{nodes[index]}</div>
   );
   ```

3. **记忆化**: 缓存文件树状态
   ```typescript
   const memoizedNodes = useMemo(() => buildTree(files), [files]);
   ```

---

## 🎨 UI/UX 设计要求

### 视觉样式

**文件节点**:
- 高度: 32px
- 悬停背景: rgba(0, 0, 0, 0.04)
- 选中背景: rgba(59, 130, 246, 0.1)
- 选中边框: 1px solid rgba(59, 130, 246, 0.3)

**图标**:
- 尺寸: 16x16px
- 间距: 8px
- 颜色: 根据文件类型映射

**缩进**:
- 每级缩进: 16px
- 图标占用: 24px
- 总行宽: 40px + (level × 16px)

### 交互动画

**展开/折叠**: 200ms 旋转动画
```css
.folder-icon {
  transition: transform 200ms cubic-bezier(0.4, 0, 0.2, 1);
}
.folder-icon.expanded {
  transform: rotate(90deg);
}
```

**拖拽反馈**: 半透明 + 阴影
```css
.dragging {
  opacity: 0.5;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}
```

---

## ✅ 验收标准

### 功能完整性

- [ ] 文件树正确显示所有文件和文件夹
- [ ] 展开/折叠功能正常
- [ ] 文件类型图标正确显示
- [ ] 拖拽移动文件功能正常
- [ ] 右键菜单显示正确的选项
- [ ] 所有菜单功能正常工作
- [ ] 键盘导航流畅
- [ ] 文件过滤和搜索功能正常

### 性能要求

- [ ] 1000+ 文件项目无卡顿
- [ ] 滚动流畅 (60fps)
- [ ] 展开/折叠动画流畅
- [ ] 搜索响应时间 < 100ms

### 状态持久化

- [ ] 展开/折叠状态保存
- [ ] 滚动位置保存
- [ ] 选中文件保存
- [ ] 刷新后恢复状态

### 可访问性

- [ ] 支持 Tab 键导航
- [ ] 支持所有键盘快捷键
- [ ] 正确的 ARIA 标签
- [ ] 屏幕阅读器友好

---

## 🚀 实施进度

### Phase 1: 基础文件树

- [ ] 实现文件树数据结构
- [ ] 实现树节点渲染
- [ ] 实现展开/折叠功能
- [ ] 实现文件类型图标

**预计工时**: 2-3 天

---

### Phase 2: 文件操作

- [ ] 实现拖拽移动文件
- [ ] 实现右键上下文菜单
- [ ] 集成文件系统 API
- [ ] 实现文件操作逻辑

**预计工时**: 3-4 天

---

### Phase 3: 高级功能

- [ ] 实现键盘导航
- [ ] 实现文件过滤和搜索
- [ ] 性能优化 (虚拟滚动)
- [ ] 状态持久化

**预计工时**: 2-3 天

---

### Phase 4: 测试和优化

- [ ] 端到端功能测试
- [ ] 性能测试和优化
- [ ] 无障碍访问测试
- [ ] 边界情况处理

**预计工时**: 1-2 天

---

## 📚 相关文档

### 相关模块
- [Sidebar 概述](./overview.md)
- [Sidebar 架构](./architecture.md)
- [文件系统模块](../../file-system.md) ⏳
- [工作视图 - 布局结构](../workspace-view/layout.md)

### 技术文档
- [react-window 文档](https://github.com/bvaughn/react-window)
- [@dnd-kit 文档](https://docs.dndkit.com/)
- [Radix UI Context Menu](https://www.radix-ui.com/docs/primitives/components/context-menu)

---

## 📝 变更历史

| 版本 | 日期 | 变更说明 | 作者 |
|-----|------|---------|-----|
| 1.0.0 | 2026-01-20 | 初始版本,文件夹面板需求定义 | My-KM Team |

---

**文档状态**: ✅ 需求定义完成
**下一步**: 开始实施开发
