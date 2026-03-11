# DOCX 编辑器核心规范

## 概述

本文档定义 DOCX 编辑器核心的技术规范，描述如何基于 Tiptap/ProseMirror 实现专业的 DOCX 文档编辑功能。

---

## ADDED Requirements

### Requirement: 编辑器初始化

系统 SHALL 支持初始化 Tiptap 编辑器实例用于 DOCX 编辑：

1. **编辑器容器**: 创建独立的编辑器容器组件
2. **Schema 配置**: 配置支持 DOCX 元素的 Schema（段落、标题、列表、表格、图片等）
3. **扩展加载**: 加载必要的 Tiptap 扩展（TextStyle, Color, Highlight, Underline, TextAlign 等）
4. **空文档处理**: 支持从空文档或现有 DOCX 内容初始化

#### Scenario: 初始化空文档编辑器
- **WHEN** 用户创建新的 DOCX 文件
- **THEN** 系统初始化一个空的 Tiptap 编辑器实例，用户可开始输入

### Requirement: DOCX 导入编辑

系统 SHALL 支持将现有 DOCX 文件内容导入编辑器：

1. **内容解析**: 使用 mammoth 或自定义解析器将 DOCX 转换为 HTML/ProseMirror 节点
2. **样式映射**: 将 Word 样式映射为 Tiptap 节点和标记属性
3. **图片处理**: 提取图片并转换为编辑器可识别的格式（Blob URL/base64）
4. **内容注入**: 使用 `editor.commands.setContent()` 注入解析后的内容

#### Scenario: 打开并编辑现有文档
- **WHEN** 用户打开一个现有的 .docx 文件进行编辑
- **THEN** 系统解析 DOCX 内容并在编辑器中正确显示，用户可立即开始编辑

### Requirement: 基础文本编辑

系统 SHALL 支持基础文本编辑功能：

1. **文本输入**: 支持用户输入和修改文本内容
2. **段落操作**: 支持段落的创建、删除、合并、拆分
3. **光标导航**: 支持箭头键、Home/End、Page Up/Down 等导航
4. **选择操作**: 支持鼠标和键盘选择文本范围

#### Scenario: 编辑段落文本
- **WHEN** 用户在段落中点击并输入文字
- **THEN** 光标定位正确，输入的文字出现在正确位置

### Requirement: 文本格式化

系统 SHALL 支持丰富的文本格式化功能：

1. **字体样式**:
   - 粗体（Ctrl/Cmd + B）
   - 斜体（Ctrl/Cmd + I）
   - 下划线（Ctrl/Cmd + U）
   - 删除线
   - 上标/下标

2. **字体属性**:
   - 字体族选择（宋体、微软雅黑、Arial、Times New Roman 等）
   - 字体大小（8pt - 72pt）
   - 字体颜色（颜色选择器）
   - 文本高亮背景色

3. **格式清除**: 支持清除所有格式（Ctrl/Cmd + \）

#### Scenario: 应用文本格式
- **WHEN** 用户选中文本并点击"粗体"按钮
- **THEN** 选中的文本变为粗体样式

### Requirement: 段落格式化

系统 SHALL 支持段落级别的格式化：

1. **对齐方式**:
   - 左对齐（Ctrl/Cmd + Shift + L）
   - 居中对齐（Ctrl/Cmd + Shift + E）
   - 右对齐（Ctrl/Cmd + Shift + R）
   - 两端对齐（Ctrl/Cmd + Shift + J）

2. **缩进**:
   - 增加缩进
   - 减少缩进
   - 首行缩进

3. **间距**:
   - 段前间距
   - 段后间距
   - 行距（单倍、1.5 倍、双倍、固定值）

4. **边框和底纹**: 段落边框和背景色

#### Scenario: 设置段落对齐
- **WHEN** 光标位于段落内，用户点击"居中"按钮
- **THEN** 整个段落内容居中对齐

### Requirement: 标题样式

系统 SHALL 支持标题样式：

1. **标题级别**: 支持标题 1-6（Heading 1-6）
2. **样式应用**: 通过工具栏或快捷键（Ctrl/Cmd + Alt + 1-6）应用标题
3. **文档大纲**: 基于标题生成文档大纲/导航

#### Scenario: 应用标题样式
- **WHEN** 用户将段落设置为"标题 1"
- **THEN** 段落应用标题 1 样式（大字号、粗体等）

### Requirement: 列表编辑

系统 SHALL 支持列表编辑功能：

1. **项目符号列表**: 创建和编辑项目符号列表
2. **编号列表**: 创建和编辑编号列表
3. **列表嵌套**: 支持多级嵌套列表
4. **列表转换**: 在普通段落、项目符号列表、编号列表之间转换
5. **列表项操作**: 支持提升/降低列表级别（Tab/Shift+Tab）

#### Scenario: 创建嵌套列表
- **WHEN** 用户在列表项中按 Tab 键
- **THEN** 当前列表项降低一级，形成嵌套结构

### Requirement: 表格编辑

系统 SHALL 支持表格编辑功能：

1. **表格插入**: 支持插入指定行列数的表格
2. **单元格编辑**: 在单元格内编辑内容
3. **行操作**:
   - 在上方插入行
   - 在下方插入行
   - 删除行
4. **列操作**:
   - 在左侧插入列
   - 在右侧插入列
   - 删除列
5. **单元格合并**:
   - 合并选定单元格
   - 拆分合并的单元格
6. **表格属性**:
   - 设置表格宽度
   - 设置单元格对齐
   - 设置表格边框

#### Scenario: 插入表格
- **WHEN** 用户点击"插入表格"并选择 3 行 4 列
- **THEN** 编辑器中插入一个 3x4 的空表格

### Requirement: 图片编辑

系统 SHALL 支持图片编辑功能：

1. **图片插入**:
   - 从本地文件插入
   - 从剪贴板粘贴
   - 拖拽插入

2. **图片属性**:
   - 调整图片尺寸（拖拽或输入精确值）
   - 设置图片对齐（左对齐、居中、右对齐）
   - 设置替代文本

3. **图片操作**:
   - 选中/取消选中
   - 复制/剪切/删除
   - 替换图片

#### Scenario: 插入图片
- **WHEN** 用户拖拽一张图片到编辑器中
- **THEN** 图片插入到光标位置，用户可调整大小

### Requirement: 链接编辑

系统 SHALL 支持超链接编辑：

1. **链接插入**: 为选定文本添加超链接
2. **链接编辑**: 修改现有链接的 URL 和显示文本
3. **链接删除**: 移除链接但保留文本
4. **链接跳转**: Ctrl/Cmd + 点击链接在新窗口打开

#### Scenario: 插入超链接
- **WHEN** 用户选中文本并点击"插入链接"按钮
- **THEN** 弹出对话框输入 URL，确认后文本变为可点击的链接

### Requirement: 查找和替换

系统 SHALL 支持查找和替换功能：

1. **查找**: 在文档中搜索文本
2. **高亮显示**: 高亮显示所有匹配结果
3. **导航**: 在匹配结果间跳转（上一个/下一个）
4. **替换**: 替换单个或全部匹配结果
5. **区分大小写**: 可选区分大小写

#### Scenario: 查找文本
- **WHEN** 用户打开查找框并输入搜索词
- **THEN** 文档中所有匹配的文本被高亮显示

### Requirement: 撤销和重做

系统 SHALL 支持撤销和重做功能：

1. **撤销**: 撤销上一步操作（Ctrl/Cmd + Z）
2. **重做**: 重做已撤销的操作（Ctrl/Cmd + Y 或 Ctrl/Cmd + Shift + Z）
3. **历史记录**: 维护可配置的历史记录深度（默认 100 步）

#### Scenario: 撤销操作
- **WHEN** 用户删除一段文本后按 Ctrl/Cmd + Z
- **THEN** 删除的文本恢复

### Requirement: 文档统计

系统 SHALL 实时统计文档信息：

1. **字数统计**: 实时显示文档总字数
2. **字符统计**: 显示字符数（含空格/不含空格）
3. **段落数**: 显示段落数量
4. **更新频率**: 每次内容变化后更新统计

#### Scenario: 查看字数统计
- **WHEN** 用户在文档中输入文字
- **THEN** 状态栏实时显示当前字数

---

## 技术实现说明

### Tiptap 编辑器配置示例

```typescript
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import TextAlign from '@tiptap/extension-text-align'
import TextStyle from '@tiptap/extension-text-style'
import Color from '@tiptap/extension-color'
import Highlight from '@tiptap/extension-highlight'
import Table from '@tiptap/extension-table'
import TableRow from '@tiptap/extension-table-row'
import TableCell from '@tiptap/extension-table-cell'
import TableHeader from '@tiptap/extension-table-header'
import Image from '@tiptap/extension-image'
import Link from '@tiptap/extension-link'

const editor = new Editor({
  extensions: [
    StarterKit.configure({
      history: {
        depth: 100,
      },
    }),
    Underline,
    TextAlign.configure({
      types: ['heading', 'paragraph'],
    }),
    TextStyle,
    Color,
    Highlight,
    Table.configure({
      resizable: true,
    }),
    TableRow,
    TableHeader,
    TableCell,
    Image,
    Link.configure({
      openOnClick: false,
    }),
  ],
  content: '',
  autofocus: true,
})
```

### 编辑器容器组件结构

```tsx
<DocxEditor>
  <EditorMenuBar>
    <Toolbar>
      <FontSelector />
      <FontSizeSelector />
      <BoldButton />
      <ItalicButton />
      <UnderlineButton />
      <ColorPicker />
      <AlignLeft />
      <AlignCenter />
      <AlignRight />
      <BulletList />
      <OrderedList />
      <InsertTable />
      <InsertImage />
      <InsertLink />
    </Toolbar>
  </EditorMenuBar>

  <EditorContent>
    <!-- Tiptap editor内容区域 -->
  </EditorContent>

  <EditorStatusBar>
    <WordCount />
    <CharCount />
    <CursorPosition />
  </EditorStatusBar>
</DocxEditor>
```
