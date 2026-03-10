# 富文本编辑器集成规范

## 概述

本文档定义富文本编辑器集成的技术规范，描述如何选择、配置和集成 Tiptap（基于 ProseMirror）编辑器框架到现有项目中。

---

## ADDED Requirements

### Requirement: Tiptap 编辑器选型

系统 SHALL 采用 Tiptap 作为富文本编辑器框架：

1. **核心特性**:
   - 基于 ProseMirror，功能强大且稳定
   - 无头（headless）架构，完全自定义 UI
   - TypeScript 支持完善
   - 活跃的社区和生态系统

2. **扩展能力**:
   - 支持自定义节点（Nodes）和标记（Marks）
   - 支持自定义命令（Commands）
   - 支持插件系统

3. **框架集成**:
   - 支持 React、Vue、Svelte 等框架
   - 提供官方 React 组件 `@tiptap/react`

#### Scenario: 集成 Tiptap 到 React 项目
- **WHEN** 在 React 组件中使用 Tiptap
- **THEN** 使用 `@tiptap/react` 的 `useEditor` Hook 创建编辑器实例

### Requirement: 编辑器 Schema 定义

系统 SHALL 定义支持 DOCX 格式的 Tiptap Schema：

1. **节点类型（Nodes）**:
   - `doc`: 文档根节点
   - `paragraph`: 段落
   - `heading`: 标题（支持 level 1-6）
   - `text`: 文本
   - `bulletList`: 项目符号列表
   - `orderedList`: 编号列表
   - `listItem`: 列表项
   - `table`: 表格
   - `tableRow`: 表格行
   - `tableCell`: 表格单元格
   - `tableHeader`: 表格标题单元格
   - `image`: 图片
   - `hardBreak`: 硬换行
   - `horizontalRule`: 水平分割线

2. **标记类型（Marks）**:
   - `link`: 超链接
   - `bold`: 粗体
   - `italic`: 斜体
   - `underline`: 下划线
   - `strike`: 删除线
   - `textStyle`: 文本样式（字体、大小、颜色）
   - `highlight`: 高亮背景

#### Scenario: 注册自定义节点
- **WHEN** 需要支持 DOCX 特有的元素（如分页符）
- **THEN** 创建自定义 Tiptap 扩展并注册到编辑器

### Requirement: 编辑器工具栏实现

系统 SHALL 实现功能完整的编辑器工具栏：

1. **文本格式化**:
   - 字体选择器（下拉菜单）
   - 字号选择器（下拉菜单）
   - 粗体、斜体、下划线、删除线按钮
   - 字体颜色选择器
   - 高亮颜色选择器
   - 清除格式按钮

2. **段落格式化**:
   - 左对齐、居中对齐、右对齐、两端对齐
   - 增加缩进、减少缩进
   - 行距选择器
   - 段落间距设置

3. **插入功能**:
   - 插入图片
   - 插入表格
   - 插入链接
   - 插入特殊字符
   - 插入分页符

4. **编辑操作**:
   - 撤销、重做
   - 查找和替换
   - 全选

#### Scenario: 工具栏按钮状态同步
- **WHEN** 光标位于粗体文本上
- **THEN** 工具栏的粗体按钮显示为激活状态

### Requirement: 编辑器状态管理

系统 SHALL 实现编辑器状态管理：

1. ** dirty 状态**: 跟踪文档是否被修改
2. **选区状态**: 跟踪当前选区范围和位置
3. **历史记录**: 管理撤销/重做栈
4. **剪贴板状态**: 管理复制/剪切的内容

#### Scenario: 检测文档修改
- **WHEN** 用户在编辑器中输入文字
- **THEN** 系统标记文档为"已修改"状态，保存按钮变为可用

### Requirement: 编辑器与文件系统同步

系统 SHALL 实现编辑器内容与文件系统的同步：

1. **自动保存**: 可配置间隔的自动保存（默认 30 秒）
2. **手动保存**: 用户触发保存（Ctrl/Cmd + S）
3. **保存状态**: 显示保存中、已保存、保存失败状态
4. **冲突检测**: 检测文件被外部修改的情况

#### Scenario: 自动保存
- **WHEN** 用户持续编辑文档
- **THEN** 系统每 30 秒自动保存一次，状态栏显示"已保存"

### Requirement: 编辑器快捷键系统

系统 SHALL 实现完整的快捷键系统：

1. **基础快捷键**:
   - `Ctrl/Cmd + B`: 粗体
   - `Ctrl/Cmd + I`: 斜体
   - `Ctrl/Cmd + U`: 下划线
   - `Ctrl/Cmd + Z`: 撤销
   - `Ctrl/Cmd + Y`: 重做
   - `Ctrl/Cmd + S`: 保存

2. **格式化快捷键**:
   - `Ctrl/Cmd + Shift + L/E/R/J`: 对齐方式
   - `Ctrl/Cmd + Alt + 1-6`: 标题级别

3. **导航快捷键**:
   - `Home/End`: 行首/行尾
   - `Ctrl/Cmd + Home/End`: 文档首/尾
   - `Ctrl/Cmd + 左右箭头`: 按词移动

4. **自定义快捷键**: 支持用户自定义快捷键

#### Scenario: 快捷键触发格式化
- **WHEN** 用户选中文本并按下 Ctrl/Cmd + B
- **THEN** 选中的文本应用粗体格式

### Requirement: 编辑器拖拽功能

系统 SHALL 支持拖拽功能：

1. **节点拖拽**: 拖拽段落、图片等节点移动位置
2. **表格拖拽**: 拖拽表格行/列调整顺序
3. **图片调整**: 拖拽图片角落调整大小
4. **外部拖入**: 支持从文件系统拖入文件

#### Scenario: 拖拽移动段落
- **WHEN** 用户拖拽段落的拖拽手柄到新位置
- **THEN** 段落移动到新位置，原位置的段落到新位置

### Requirement: 编辑器粘贴处理

系统 SHALL 智能处理粘贴内容：

1. **纯文本粘贴**: 粘贴为纯文本（Ctrl/Cmd + Shift + V）
2. **富文本粘贴**: 保留格式的 HTML 粘贴
3. **Word 粘贴**: 特殊处理从 Word 复制的内容
4. **图片粘贴**: 处理剪贴板中的图片
5. **URL 粘贴**: 自动将 URL 转换为链接

#### Scenario: 从 Word 粘贴
- **WHEN** 用户从 Microsoft Word 复制内容并粘贴
- **THEN** 系统保留基本格式（粗体、斜体、列表等），过滤不支持的样式

### Requirement: 编辑器可访问性

系统 SHALL 支持无障碍访问：

1. **键盘导航**: 所有功能可通过键盘访问
2. **ARIA 标签**: 工具栏按钮和编辑器区域有适当的 ARIA 标签
3. **屏幕阅读器**: 与屏幕阅读器兼容
4. **焦点管理**: 正确的焦点管理和可见性

#### Scenario: 键盘导航
- **WHEN** 用户使用 Tab 键在工具栏中导航
- **THEN** 焦点按逻辑顺序移动，每个按钮都有清晰的焦点指示器

### Requirement: 编辑器性能优化

系统 SHALL 优化编辑器性能：

1. **虚拟滚动**: 对于长文档实现虚拟滚动
2. **防抖更新**: 工具栏状态更新使用防抖
3. **懒加载**: 大型图片懒加载
4. **事务批处理**: 合并多个操作为单个事务

#### Scenario: 大文档编辑
- **WHEN** 编辑包含 100+ 段的文档
- **THEN** 编辑器保持流畅响应，输入延迟小于 50ms

---

## 技术实现说明

### Tiptap React 集成示例

```tsx
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import TextAlign from '@tiptap/extension-text-align'

const MenuBar = ({ editor }: { editor: Editor }) => {
  if (!editor) return null

  return (
    <div className="toolbar">
      <button
        onClick={() => editor.chain().focus().toggleBold().run()}
        className={editor.isActive('bold') ? 'is-active' : ''}
      >
        粗体
      </button>
      <button
        onClick={() => editor.chain().focus().toggleItalic().run()}
        className={editor.isActive('italic') ? 'is-active' : ''}
      >
        斜体
      </button>
      <button
        onClick={() => editor.chain().focus().toggleUnderline().run()}
        className={editor.isActive('underline') ? 'is-active' : ''}
      >
        下划线
      </button>
    </div>
  )
}

const DocxEditor = () => {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        underline: false,
        textAlign: false,
      }),
      Underline,
      TextAlign.configure({
        types: ['heading', 'paragraph'],
      }),
    ],
    content: '',
    onUpdate: ({ editor }) => {
      // 处理内容变化
      const html = editor.getHTML()
      const text = editor.getText()
      const wordCount = text.length
    },
  })

  return (
    <div>
      <MenuBar editor={editor} />
      <EditorContent editor={editor} />
    </div>
  )
}
```

### 自定义扩展示例

```typescript
import { Node } from '@tiptap/core'

// 自定义分页符节点
const PageBreak = Node.create({
  name: 'pageBreak',

  group: 'block',

  atom: true,

  parseHTML() {
    return [{ tag: 'div[data-type="page-break"]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', { ...HTMLAttributes, 'data-type': 'page-break' }, '分页符']
  },

  addCommands() {
    return {
      insertPageBreak:
        () =>
        ({ commands }) => {
          return commands.insertContent({
            type: this.name,
          })
        },
    }
  },
})
```

### 编辑器依赖包

```json
{
  "dependencies": {
    "@tiptap/core": "^2.x",
    "@tiptap/react": "^2.x",
    "@tiptap/starter-kit": "^2.x",
    "@tiptap/extension-underline": "^2.x",
    "@tiptap/extension-text-align": "^2.x",
    "@tiptap/extension-text-style": "^2.x",
    "@tiptap/extension-color": "^2.x",
    "@tiptap/extension-highlight": "^2.x",
    "@tiptap/extension-link": "^2.x",
    "@tiptap/extension-image": "^2.x",
    "@tiptap/extension-table": "^2.x",
    "@tiptap/extension-table-row": "^2.x",
    "@tiptap/extension-table-cell": "^2.x",
    "@tiptap/extension-table-header": "^2.x",
    "@tiptap/extension-history": "^2.x"
  }
}
```
