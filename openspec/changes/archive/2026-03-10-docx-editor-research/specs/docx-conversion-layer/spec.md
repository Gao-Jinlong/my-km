# DOCX 转换层规范

## 概述

本文档定义 DOCX 转换层的技术规范，描述如何实现 DOCX 与其他格式（Markdown、HTML）之间的双向转换。

---

## ADDED Requirements

### Requirement: DOCX 到 HTML 转换

系统 SHALL 支持将 DOCX 转换为 HTML：

1. **转换引擎**: 使用 mammoth 或自定义解析器进行转换
2. **样式保留**: 尽可能保留原始格式（字体、颜色、对齐等）
3. **图片处理**: 提取图片并转换为 base64 或 Blob URL
4. **结构映射**: 正确映射标题、段落、列表、表格等结构

#### Scenario: 转换为 HTML 预览
- **WHEN** 用户需要在网页中预览 DOCX 内容
- **THEN** 系统生成语义化的 HTML，可在任意 HTML 容器中显示

### Requirement: DOCX 到 Markdown 转换

系统 SHALL 支持将 DOCX 转换为 Markdown：

1. **文本内容**: 保留纯文本内容
2. **标题映射**: DOCX 标题 → Markdown 标题（# ## ###）
3. **列表映射**:
   - 项目符号列表 → `-` 或 `*`
   - 编号列表 → `1. 2. 3.`
4. **格式化映射**:
   - 粗体 → `**text**`
   - 斜体 → `*text*`
   - 删除线 → `~~text~~`
5. **链接**: 转换为 `[text](url)` 格式
6. **图片**: 转换为 `![alt](path)` 格式
7. **表格**: 转换为 Markdown 表格语法

#### Scenario: 导出为 Markdown
- **WHEN** 用户选择"导出为 Markdown"
- **THEN** 系统生成 .md 文件，保留文档结构和格式

### Requirement: Markdown 到 DOCX 转换

系统 SHALL 支持将 Markdown 转换为 DOCX：

1. **解析 Markdown**: 使用 markdown-it 或 similar 库解析
2. **AST 转换**: 将 Markdown AST 转换为 docx 库的节点结构
3. **样式应用**: 为转换后的元素应用合适的 Word 样式
4. **图片嵌入**: 将 Markdown 图片引用嵌入为 DOCX 内部图片

#### Scenario: Markdown 导入编辑
- **WHEN** 用户打开一个 .md 文件并选择"以 DOCX 格式编辑"
- **THEN** 系统将 Markdown 转换为 DOCX 结构并在编辑器中显示

### Requirement: HTML 到 DOCX 转换

系统 SHALL 支持将 HTML 转换为 DOCX：

1. **HTML 解析**: 解析 HTML 为 DOM 树
2. **样式提取**: 提取内联样式和类样式
3. **节点映射**: 将 HTML 元素映射为 docx 节点
4. **图片处理**: 下载并嵌入 HTML 中的外部图片

#### Scenario: HTML 内容导入
- **WHEN** 用户粘贴 HTML 内容到编辑器
- **THEN** 系统将 HTML 转换为 DOCX 格式并保留样式

### Requirement: 转换保真度保证

系统 SHALL 尽力保持转换过程中的内容保真度：

1. **内容完整性**: 确保所有文本内容不丢失
2. **结构完整性**: 确保文档结构（标题层级、列表嵌套等）正确
3. **格式降级**: 对于无法精确匹配的格式，采用合理的降级策略
4. **转换提示**: 当格式无法完全保留时，告知用户

#### Scenario: 复杂格式降级
- **WHEN** DOCX 包含复杂表格边框样式转换为 Markdown
- **THEN** 系统保留表格结构但简化边框，并提示用户样式已简化

### Requirement: 图片转换处理

系统 SHALL 正确处理转换过程中的图片：

1. **DOCX → HTML/MD**:
   - 提取图片为独立文件
   - 生成正确的引用路径
2. **HTML/MD → DOCX**:
   - 下载或读取本地图片
   - 嵌入到 DOCX 内部
3. **格式转换**: 必要时进行图片格式转换（如 EMF → PNG）

#### Scenario: 图片提取
- **WHEN** 将包含 5 张图片的 DOCX 导出为 Markdown
- **THEN** 系统生成 .md 文件和 images/ 文件夹包含所有提取的图片

### Requirement: 批量转换支持

系统 SHALL 支持批量转换操作：

1. **多文件选择**: 用户可选择多个文件进行转换
2. **进度显示**: 显示批量转换的进度
3. **错误处理**: 单个文件失败不影响其他文件
4. **输出组织**: 合理组织转换后的文件结构

#### Scenario: 批量导出
- **WHEN** 用户选择 10 个 DOCX 文件导出为 Markdown
- **THEN** 系统依次转换所有文件并在完成后提示结果

---

## 技术实现说明

### DOCX → HTML 转换（使用 mammoth）

```typescript
import mammoth from 'mammoth';

async function docxToHtml(docxBuffer: ArrayBuffer): Promise<{ html: string; messages: any[] }> {
  const result = await mammoth.convertToHtml({
    arrayBuffer: docxBuffer,
  });

  return {
    html: result.value,  // 生成的 HTML
    messages: result.messages,  // 转换警告和错误信息
  };
}

// 自定义样式映射
const styleMap = [
  'p[style-name="Heading 1"] => h1:fresh',
  'p[style-name="Heading 2"] => h2:fresh',
  'p[style-name="Normal"] => p',
];
```

### DOCX → Markdown 转换

```typescript
import mammoth from 'mammoth';
import TurndownService from 'turndown';

async function docxToMarkdown(docxBuffer: ArrayBuffer): Promise<string> {
  // 第一步：DOCX → HTML
  const htmlResult = await mammoth.convertToHtml({
    arrayBuffer: docxBuffer,
  });

  // 第二步：HTML → Markdown
  const turndownService = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
  });

  const markdown = turndownService.turndown(htmlResult.value);
  return markdown;
}
```

### Markdown → DOCX 转换（使用 docx 库）

```typescript
import { Document, Packer, Paragraph, HeadingLevel, Table, TableCell, TableRow, WidthType } from 'docx';
import markdownIt from 'markdown-it';

async function markdownToDocx(markdown: string): Promise<Blob> {
  const md = markdownIt();
  const html = md.render(markdown);

  // 解析 HTML 并转换为 docx 节点
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  const children: any[] = [];

  // 遍历 HTML 节点并转换
  for (const node of Array.from(doc.body.children)) {
    switch (node.tagName) {
      case 'H1':
        children.push(new Paragraph({
          text: node.textContent,
          heading: HeadingLevel.HEADING_1,
        }));
        break;
      case 'P':
        children.push(new Paragraph({
          text: node.textContent,
        }));
        break;
      // ... 处理其他元素
    }
  }

  const doc = new Document({
    sections: [{
      properties: {},
      children,
    }],
  });

  const blob = await Packer.toBlob(doc);
  return blob;
}
```

### 转换配置选项

```typescript
interface ConversionOptions {
  // DOCX → HTML/MD
  extractImages?: boolean;
  imageDir?: string;  // 图片输出目录

  // MD → DOCX
  defaultFont?: string;
  pageSize?: 'A4' | 'Letter' | 'Legal';
  margins?: { top: number; bottom: number; left: number; right: number };

  // 通用
  preserveStyles?: boolean;
  includeMetadata?: boolean;
}
```

### 转换警告处理

```typescript
interface ConversionMessage {
  type: 'info' | 'warning' | 'error';
  message: string;
  element?: string;  // 相关元素
}

// 示例警告
const warnings: ConversionMessage[] = [
  { type: 'warning', message: '复杂表格边框已简化', element: 'table' },
  { type: 'info', message: '页眉页脚未在 Markdown 中保留', element: 'header/footer' },
  { type: 'error', message: '无法解析的图片格式', element: 'image.emf' },
];
```
