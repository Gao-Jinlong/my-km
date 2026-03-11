# DOCX 预览引擎规范

## 概述

本文档定义 DOCX 预览引擎的技术规范，描述如何在浏览器中将 DOCX 文档渲染为可视化的 HTML 内容。

---

## ADDED Requirements

### Requirement: DOCX 文件加载

系统 SHALL 支持从多种来源加载 DOCX 文件：

1. **本地文件**: 通过 File System API 读取本地 .docx 文件
2. **ArrayBuffer**: 支持从 ArrayBuffer 直接加载（适用于上传场景）
3. **Blob/URL**: 支持从 Blob URL 加载
4. **远程 URL**: 支持从 HTTP/HTTPS URL 加载（需考虑 CORS）

#### Scenario: 从本地文件系统加载
- **WHEN** 用户在文件树中点击一个 .docx 文件
- **THEN** 系统通过 File System API 读取文件并在预览容器中渲染

### Requirement: ZIP 解压处理

系统 SHALL 使用 zip.js 库解压 DOCX 文件：

1. **流式解压**: 支持流式读取 ZIP 内容，避免一次性加载大文件
2. **按需解压**: 仅解压需要的部件（如 document.xml、styles.xml）
3. **图片提取**: 从 `word/media/` 提取图片资源为 Blob URL

#### Scenario: 解压包含大量图片的文档
- **WHEN** 打开一个包含 20+ 张图片的 DOCX 文件
- **THEN** 系统仅提取实际需要在预览中显示的图片

### Requirement: OOXML 解析

系统 SHALL 解析 DOCX 内部的 XML 部件：

1. **主文档解析**: 解析 `word/document.xml` 获取文档主体内容
2. **样式解析**: 解析 `word/styles.xml` 获取样式定义
3. **编号解析**: 解析 `word/numbering.xml` 获取列表定义
4. **关系解析**: 解析 `.rels` 文件建立部件间引用关系

#### Scenario: 解析样式引用
- **WHEN** 段落使用自定义样式（通过 `w:pStyle` 引用）
- **THEN** 系统能够从 styles.xml 查找并应用对应的样式定义

### Requirement: HTML 渲染输出

系统 SHALL 将解析后的 DOCX 内容渲染为 HTML：

1. **语义化 HTML**: 使用合适的 HTML 标签（`<p>`, `<h1-h6>`, `<ul/ol>`, `<table>` 等）
2. **内联样式**: 将 Word 样式转换为 CSS 内联样式
3. **图片嵌入**: 将提取的图片转换为 Blob URL 或 base64 嵌入
4. **表格渲染**: 正确渲染表格结构，支持合并单元格

#### Scenario: 渲染格式化段落
- **WHEN** 段落包含多种格式（粗体、斜体、不同颜色）
- **THEN** 系统生成带有正确样式的 HTML，使用 `<strong>`, `<em>`, `<span style="color:...">` 等标签

### Requirement: 样式映射

系统 SHALL 建立 Word 样式到 CSS 的映射关系：

| Word 属性 | CSS 映射 |
|-----------|----------|
| `w:b` (粗体) | `font-weight: bold` |
| `w:i` (斜体) | `font-style: italic` |
| `w:u` (下划线) | `text-decoration: underline` |
| `w:strike` (删除线) | `text-decoration: line-through` |
| `w:sz` (字号) | `font-size: {sz/2}pt` |
| `w:color` (颜色) | `color: #{color}` |
| `w:ind` (缩进) | `margin-left/padding-left` |
| `w:jc` (对齐) | `text-align` |

#### Scenario: 转换字号
- **WHEN** Word 中字号设置为 24 (w:sz=48，单位为半点)
- **THEN** CSS 中 `font-size: 24pt`

### Requirement: 列表渲染

系统 SHALL 正确渲染 DOCX 中的列表：

1. **项目符号列表**: 转换为 `<ul>` + `<li>`
2. **编号列表**: 转换为 `<ol>` + `<li>`
3. **多级列表**: 支持嵌套列表结构
4. **自定义编号**: 保留自定义编号格式（如罗马数字、字母）

#### Scenario: 渲染多级列表
- **WHEN** 文档包含三级嵌套列表
- **THEN** 系统生成正确的嵌套 `<ul>/<ol>` 结构

### Requirement: 表格渲染

系统 SHALL 正确渲染 DOCX 中的表格：

1. **表格结构**: 使用 `<table>`, `<thead>`, `<tbody>`, `<tr>`, `<td>`, `<th>`
2. **单元格合并**: 使用 `rowspan` 和 `colspan` 属性
3. **边框样式**: 转换 Word 表格边框为 CSS border
4. **单元格对齐**: 支持水平和垂直对齐

#### Scenario: 渲染合并单元格表格
- **WHEN** 表格包含跨 2 行 3 列的合并单元格
- **THEN** 系统生成正确的 `rowspan="2" colspan="3"` 属性

### Requirement: 图片渲染

系统 SHALL 正确渲染 DOCX 中的图片：

1. **图片提取**: 从 `word/media/` 提取原始图片数据
2. **尺寸保持**: 保持 Word 中定义的图片尺寸（或等比缩放）
3. **格式支持**: 支持 PNG、JPEG、GIF、BMP、EMF、WMF
4. **替代文本**: 使用 `<w:docPr>` 中的 alt 文本作为 img 的 alt 属性

#### Scenario: 渲染嵌入图片
- **WHEN** 文档包含一张 PNG 图片
- **THEN** 系统提取图片并生成 `<img src="blob:...">` 标签

### Requirement: 页眉页脚渲染

系统 SHALL 支持页眉页脚的预览：

1. **可选显示**: 用户可选择是否显示页眉页脚
2. **视觉区分**: 使用浅灰色背景或边框区分页眉页脚区域
3. **位置正确**: 页眉在每页顶部，页脚在每页底部

#### Scenario: 显示页眉页脚
- **WHEN** 用户启用"显示页眉页脚"选项
- **THEN** 系统在预览顶部和底部显示页眉页脚内容

### Requirement: 分页预览

系统 SHALL 支持分页预览模式：

1. **分页模拟**: 根据 A4/Letter 等纸张尺寸模拟分页效果
2. **页边距**: 显示页边距，内容在可打印区域内
3. **页面指示**: 显示页码或页面分隔线

#### Scenario: A4 纸张预览
- **WHEN** 文档设置为 A4 纸张（21cm × 29.7cm）
- **THEN** 系统按 A4 比例显示分页效果

### Requirement: 预览容器适配

系统 SHALL 适配不同尺寸的预览容器：

1. **响应式宽度**: 内容宽度适配容器，支持 100% 宽度
2. **滚动支持**: 内容超出时显示滚动条
3. **缩放支持**: 支持用户缩放预览（50% - 200%）

#### Scenario: 容器尺寸变化
- **WHEN** 用户调整编辑器面板大小
- **THEN** 预览内容自动重新布局适配新容器

---

## 技术实现说明

### 推荐库：docx-preview

```javascript
import { renderAsync } from 'docx-preview';

const docxFileInput = document.getElementById('docx-input');
const previewContainer = document.getElementById('preview');

const options = {
  className: 'docx',           // 容器类名前缀
  inWrapper: true,             // 启用包装器
  ignoreWidth: false,          // 不忽略文档宽度
  ignoreHeight: false,         // 不忽略文档高度
  ignoreFonts: false,          // 不忽略字体
  breakPages: true,            // 启用分页
  experimental: false,         // 不启用实验功能
  trimXmlDeclaration: true,    // 移除 XML 声明
};

await renderAsync(docxFileInput, previewContainer, null, options);
```

### CSS 样式建议

```css
.docx-wrapper {
  background: #f5f5f5;
  padding: 20px;
  overflow: auto;
}

.docx-document {
  background: white;
  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
  margin: 0 auto;
}

.docx-page {
  margin-bottom: 20px;
  page-break-after: always;
}
```
