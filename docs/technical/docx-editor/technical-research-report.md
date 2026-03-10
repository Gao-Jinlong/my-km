# DOCX 文档编辑器技术调研报告

## 1. 调研背景

### 1.1 目的

本报告旨在为个人知识库系统（my-km）添加 DOCX 文档编辑功能提供技术调研支持，帮助开发团队了解 DOCX 文档开发所需的背景知识、技术选型和实施路径。

### 1.2 目标用户场景

- **技术写作者**：撰写技术文档、教程，需要与 Word 用户协作
- **学术研究者**：撰写论文、报告，需要符合学术格式规范
- **商务人士**：处理商务文档、合同、报告
- **学生**：完成作业、论文，需要与教师/同学交换文档

### 1.3 核心需求

1. **专业级编辑**：支持样式、表格、图片、页眉页脚等复杂功能
2. **格式保真**：导入导出保持格式一致性
3. **本地优先**：基于浏览器 File System API，数据存储在本地
4. **AI 集成**：支持 AI 辅助写作和文档分析

---

## 2. DOCX 文件格式规范

### 2.1 DOCX 格式概述

**DOCX** 是 Microsoft Word 2007 及以后版本使用的默认文档格式，基于 **Office Open XML (OOXML)** 标准。

#### 核心标准

| 标准 | 说明 |
|------|------|
| ECMA-376 | ECMA International 发布的 OOXML 标准 |
| ISO/IEC 29500 | ISO/IEC 采纳的国际标准 |
| ISO/IEC 29501-4 | 分别定义概述、Open Packaging Convention、Markup Compatibility、WML/XLML/PML |

### 2.2 DOCX 文件结构

DOCX 文件本质上是一个 **ZIP 压缩包**，包含多个 XML 文件和资源：

```
document.docx
├── [Content_Types].xml      # 定义包内各部件的 MIME 类型
├── _rels/
│   └── .rels                # 包级关系定义
├── word/
│   ├── document.xml         # 主文档内容
│   ├── styles.xml           # 样式定义
│   ├── numbering.xml        # 编号和列表定义
│   ├── theme/
│   │   └── theme1.xml       # 主题定义
│   ├── media/               # 嵌入的图片等资源
│   ├── header*.xml          # 页眉
│   └── footer*.xml          # 页脚
└── docProps/
    ├── core.xml             # 核心属性（作者、标题等）
    └── app.xml              # 应用属性（字数、段落数等）
```

### 2.3 核心 XML 元素

#### 文档结构元素

```xml
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <!-- 段落 -->
    <w:p>
      <w:pPr>...</w:pPr>  <!-- 段落属性 -->
      <w:r>               <!-- 运行（文本段） -->
        <w:rPr>...</w:rPr>  <!-- 运行属性（格式） -->
        <w:t>文本内容</w:t>
      </w:r>
    </w:p>

    <!-- 表格 -->
    <w:tbl>
      <w:tr>              <!-- 行 -->
        <w:tc>            <!-- 单元格 -->
          <w:p>...</w:p>
        </w:tc>
      </w:tr>
    </w:tbl>
  </w:body>
</w:document>
```

#### 格式化元素

| 元素 | 说明 | CSS 映射 |
|------|------|----------|
| `<w:b>` | 粗体 | `font-weight: bold` |
| `<w:i>` | 斜体 | `font-style: italic` |
| `<w:u>` | 下划线 | `text-decoration: underline` |
| `<w:strike>` | 删除线 | `text-decoration: line-through` |
| `<w:sz>` | 字号（单位：半点） | `font-size: {sz/2}pt` |
| `<w:color>` | 字体颜色 | `color: #{color}` |
| `<w:ind>` | 缩进 | `margin-left/padding-left` |
| `<w:jc>` | 对齐 | `text-align` |

### 2.4 开发所需背景知识

1. **XML 处理**：熟悉 XML 解析、XPath 查询
2. **ZIP 格式**：理解 ZIP 压缩包结构，能使用 zip.js 等库
3. **命名空间**：理解 XML 命名空间（WML、Relationships）
4. **CSS 样式**：能够将 Word 样式映射为 CSS
5. **浏览器 API**：File System API、Blob、ArrayBuffer

---

## 3. 现有工具库调研

### 3.1 文档生成库

#### docx (dolanmiu) ⭐ 推荐

**GitHub**: [dolanmiu/docx](https://github.com/dolanmiu/docx)

| 特性 | 说明 |
|------|------|
| 语言 | TypeScript (100%) |
| 环境 | 浏览器 + Node.js |
| 功能 | 生成和修改 .docx 文件 |
| API | 声明式 JavaScript/TypeScript API |
| 文档 | [docx.js.org](https://docx.js.org/) |

**示例代码**：

```typescript
import { Document, Packer, Paragraph, HeadingLevel } from "docx";

const doc = new Document({
  sections: [{
    properties: {},
    children: [
      new Paragraph({
        text: "Hello World",
        heading: HeadingLevel.HEADING_1,
      }),
    ],
  }],
});

const blob = await Packer.toBlob(doc);
```

**优点**：
- TypeScript 编写，类型定义完整
- 声明式 API，易于上手
- 功能覆盖全面（段落、表格、图片、页眉页脚）
- 活跃的社区维护

**缺点**：
- 仅支持生成，不支持读取现有 DOCX

---

### 3.2 文档预览库

#### docx-preview ⭐ 推荐

**GitHub**: [zvolscak/docx-preview](https://github.com/zvolscak/docx-preview)

| 特性 | 说明 |
|------|------|
| 功能 | 在浏览器中渲染 DOCX 为 HTML |
| 体积 | ~50KB (gzipped) |
| 依赖 | 无第三方依赖 |
| 渲染 | 保持 Word 格式保真度 |

**示例代码**：

```javascript
import { renderAsync } from 'docx-preview';

const docxFile = document.getElementById('docx-input').files[0];
const previewContainer = document.getElementById('preview');

await renderAsync(docxFile, previewContainer, null, {
  className: 'docx',
  inWrapper: true,
  breakPages: true,
});
```

**优点**：
- 专注预览场景，体积小
- 渲染质量高，保持 Word 格式
- 纯前端实现，无后端依赖

**缺点**：
- 仅用于预览，不支持编辑

---

#### mammoth.js

**GitHub**: [mwilliamson/mammoth.js](https://github.com/mwilliamson/mammoth.js)

| 特性 | 说明 |
|------|------|
| 功能 | DOCX → HTML 转换 |
| 理念 | "提取内容，忽略精确格式" |
| 适用 | 纯文本提取、简化 HTML 转换 |

**示例代码**：

```javascript
import mammoth from 'mammoth';

const result = await mammoth.convertToHtml({
  arrayBuffer: docxBuffer,
});

console.log(result.value);    // HTML
console.log(result.messages); // 警告和错误
```

**优点**：
- 轻量级
- 转换速度快
- 可自定义样式映射

**缺点**：
- 格式保真度低，不适合精确预览
- 表格、图片等复杂元素支持有限

---

### 3.3 富文本编辑器框架

#### Tiptap (基于 ProseMirror) ⭐ 推荐

**官网**: [tiptap.dev](https://tiptap.dev/)

| 特性 | 说明 |
|------|------|
| 基础 | 基于 ProseMirror |
| 架构 | 无头（headless），完全自定义 UI |
| 框架 | 支持 React、Vue、Svelte |
| 扩展 | 丰富的插件生态系统 |
| 协作 | 支持协作编辑（Hocuspocus） |

**示例代码**：

```tsx
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'

const Editor = () => {
  const editor = useEditor({
    extensions: [StarterKit],
    content: '<p>Hello World!</p>',
  })

  return (
    <div>
      <button onClick={() => editor.chain().focus().toggleBold().run()}>
        粗体
      </button>
      <EditorContent editor={editor} />
    </div>
  )
}
```

**优点**：
- 基于 ProseMirror，功能强大稳定
- 无头架构，UI 完全自定义
- 丰富的扩展生态
- TypeScript 支持完善

**缺点**：
- 学习曲线中等
- 需要自行实现 UI 组件

---

#### ProseMirror

**官网**: [prosemirror.net](https://prosemirror.net/)

| 特性 | 说明 |
|------|------|
| 定位 | 底层富文本编辑框架 |
| 灵活性 | 极高，完全可定制 |
| 文档 | 详细但较复杂 |

**优点**：
- 功能最强大，完全可控
- 支持协作编辑
- 成熟的解决方案

**缺点**：
- API 复杂，学习曲线陡峭
- 需要较多代码实现 UI

---

#### Lexical

**GitHub**: [facebook/lexical](https://github.com/facebook/lexical)

| 特性 | 说明 |
|------|------|
| 出品 | Facebook/Meta |
| 性能 | 优秀，针对大文档优化 |
| 扩展 | 插件系统 |

**优点**：
- 性能好
- 现代架构
- React 友好

**缺点**：
- 相对年轻，生态不如 Tiptap
- DOCX 相关扩展较少

---

### 3.4 ZIP 处理库

#### @zip.js/zip.js ⭐ 推荐

**官网**: [gildas-lormeau.github.io/zip.js](https://gildas-lormeau.github.io/zip.js/)

| 特性 | 说明 |
|------|------|
| 功能 | ZIP 解压/压缩 |
| 依赖 | 无第三方依赖 |
| 环境 | 浏览器 + Node.js + Deno |
| 特性 | 支持流式处理、Worker Pool |

**示例代码**：

```javascript
import * as zip from "@zip.js/zip.js";

const blobReader = new zip.BlobReader(docxBlob);
const zipReader = new zip.ZipReader(blobReader);
const entries = await zipReader.getEntries();

// 读取文件内容
const text = await entries[0].getData(new zip.TextWriter());
const blob = await entries[0].getData(new zip.BlobWriter());
```

---

### 3.5 格式转换库

#### Turndown Service

**GitHub**: [mixmark-io/turndown](https://github.com/mixmark-io/turndown)

| 特性 | 说明 |
|------|------|
| 功能 | HTML → Markdown |
| 定制 | 可自定义转换规则 |

**用途**：配合 mammoth 实现 DOCX → Markdown 转换

---

#### markdown-it

**GitHub**: [markdown-it/markdown-it](https://github.com/markdown-it/markdown-it)

| 特性 | 说明 |
|------|------|
| 功能 | Markdown 解析 |
| 扩展 | 丰富的插件系统 |
| 性能 | 快速 |

**用途**：配合 docx 库实现 Markdown → DOCX 转换

---

## 4. 技术选型建议

### 4.1 推荐技术栈

基于调研，推荐以下技术组合：

| 功能 | 推荐库 | 理由 |
|------|--------|------|
| 文档生成 | `docx` (dolanmiu) | TypeScript、声明式 API、功能全面 |
| 文档预览 | `docx-preview` | 轻量、高保真、纯前端 |
| 文档读取 | `mammoth` + 自定义解析 | 简单场景用 mammoth，复杂场景自定义 |
| 编辑器 | `Tiptap` | 无头架构、生态丰富、易集成 |
| ZIP 处理 | `@zip.js/zip.js` | 无依赖、流式处理、跨平台 |
| HTML→MD | `turndown` | 成熟、可定制 |
| MD 解析 | `markdown-it` | 快速、扩展丰富 |

### 4.2 架构设计

```
┌─────────────────────────────────────────────────────┐
│                  UI Layer (React)                    │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  │
│  │  Preview    │  │   Editor    │  │   Export    │  │
│  │  Component  │  │  Component  │  │   Button    │  │
│  └─────────────┘  └─────────────┘  └─────────────┘  │
└─────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────┐
│              Editor Abstraction Layer                │
│  ┌─────────────────────────────────────────────────┐│
│  │         Tiptap Editor Instance + Extensions     ││
│  └─────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────┘
                            │
              ┌─────────────┼─────────────┐
              ▼             ▼             ▼
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
│  Import Layer   │ │  Content Layer  │ │  Export Layer   │
│  mammoth        │ │  Tiptap State   │ │  docx generator │
│  docx-preview   │ │                 │ │                 │
└─────────────────┘ └─────────────────┘ └─────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────┐
│                  File System Layer                   │
│    File System API + IndexedDB + zip.js             │
└─────────────────────────────────────────────────────┘
```

---

## 5. 实施建议

### 5.1 分阶段实施

**阶段 1：基础架构（1-2 周）**
- 安装和配置核心依赖
- 搭建编辑器基础框架
- 实现文件加载和 ZIP 解压

**阶段 2：预览功能（1 周）**
- 集成 docx-preview
- 实现预览 UI
- 测试各种 DOCX 样本

**阶段 3：编辑功能（2-3 周）**
- 集成 Tiptap 编辑器
- 实现核心编辑功能
- 实现导入/导出

**阶段 4：高级功能（1-2 周）**
- 表格、图片等复杂元素
- 样式和格式化功能
- 格式转换

**阶段 5：AI 集成与优化（1-2 周）**
- AI 辅助写作集成
- 性能优化
- 全面测试

### 5.2 关键风险与缓解

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| 格式保真度损失 | 用户体验差 | 充分测试，降级提示 |
| 大文件性能 | 卡顿 | 虚拟滚动、懒加载 |
| 浏览器兼容性 | 部分用户无法使用 | 降级方案、明确标注 |
| 依赖库维护 | 项目被迫升级 | 锁定版本、抽象核心逻辑 |

---

## 6. 参考资料

### 6.1 规范文档

- [ECMA-376 Office Open XML](https://www.ecma-international.org/publications-and-standards/standards/ecma-376/)
- [ISO/IEC 29500](https://www.iso.org/standard/71691.html)

### 6.2 库文档

- [docx.js.org](https://docx.js.org/)
- [Tiptap Documentation](https://tiptap.dev/docs)
- [docx-preview GitHub](https://github.com/zvolscak/docx-preview)
- [mammoth.js GitHub](https://github.com/mwilliamson/mammoth.js)
- [zip.js Documentation](https://gildas-lormeau.github.io/zip.js/)

### 6.3 教程和资源

- [Office Open XML 简介](https://learn.microsoft.com/en-us/office/open-xml/open-xml-sdk)
- [ProseMirror 指南](https://prosemirror.net/docs/guide/)

---

## 7. 附录

### 7.1 依赖包清单

```json
{
  "dependencies": {
    "docx": "^8.x",
    "docx-preview": "^0.3.x",
    "mammoth": "^1.x",
    "@zip.js/zip.js": "^2.x",
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
    "turndown": "^7.x",
    "markdown-it": "^14.x"
  }
}
```

### 7.2 浏览器兼容性

| 功能 | Chrome | Edge | Firefox | Safari |
|------|--------|------|---------|--------|
| File System API | ✅ 86+ | ✅ 86+ | ⚠️ 部分 | ⚠️ 部分 |
| IndexedDB | ✅ | ✅ | ✅ | ✅ |
| 编辑器核心 | ✅ | ✅ | ✅ | ✅ |

**推荐浏览器**：Chrome 86+ 或 Edge 86+

---

**报告生成日期**：2026-03-10
**版本**：1.0.0
