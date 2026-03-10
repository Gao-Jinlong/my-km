# DOCX 文件格式规范

## 概述

本文档定义 DOCX 文件格式的技术规范，包括 ECMA-376/OOXML 标准的核心概念、文档结构和解析要求。

---

## ADDED Requirements

### Requirement: DOCX 文件格式理解

系统 SHALL 理解 DOCX 文件的基本结构和格式规范，包括：

1. **文档容器**: DOCX 文件本质上是 ZIP 压缩包，包含多个 XML 文件和资源
2. **OOXML 标准**: 遵循 ECMA-376 和 ISO/IEC 29500 标准
3. **核心部件**:
   - `[Content_Types].xml`: 定义包内各部件的 MIME 类型
   - `_rels/.rels`: 包级关系定义
   - `word/document.xml`: 主文档内容
   - `word/styles.xml`: 样式定义
   - `word/numbering.xml`: 编号和列表定义
   - `word/media/`: 嵌入的图片和其他媒体
   - `word/header*.xml` / `word/footer*.xml`: 页眉页脚
   - `docProps/`: 文档属性（作者、标题等）

#### Scenario: 解析 DOCX 文件结构
- **WHEN** 系统接收到一个 .docx 文件
- **THEN** 系统能够使用 zip.js 解压并识别所有核心部件

### Requirement: ECMA-376 标准兼容性

系统 SHALL 支持 ECMA-376 标准中定义的核心文档元素：

1. **文本内容**:
   - 段落 (`<w:p>`)
   - 运行/文本段 (`<w:r>`)
   - 文本 (`<w:t>`)

2. **格式化**:
   - 字体样式（粗体、斜体、下划线、删除线）
   - 字体大小和颜色
   - 字体族
   - 文本对齐

3. **段落格式**:
   - 缩进（左、右、首行）
   - 间距（段前、段后、行距）
   - 边框和底纹

4. **列表**:
   - 项目符号列表
   - 编号列表
   - 多级列表

#### Scenario: 解析格式化文本
- **WHEN** 文档包含带有多个格式运行（runs）的段落
- **THEN** 系统能够正确识别每个运行的独立格式属性

### Requirement: 表格结构支持

系统 SHALL 支持 DOCX 中的表格结构：

1. **表格定义**: `<w:tbl>` 元素
2. **表格属性**: 宽度、边框、对齐方式
3. **行**: `<w:tr>` 元素
4. **单元格**:
   - `<w:tc>` 单元格元素
   - 单元格属性（宽度、垂直对齐、边框）
   - 合并单元格（行合并 `@w:rowSpan`、列合并 `@w:colSpan`）

#### Scenario: 解析复杂表格
- **WHEN** 文档包含带有合并单元格的表格
- **THEN** 系统能够正确识别单元格之间的跨行/跨列关系

### Requirement: 图片嵌入支持

系统 SHALL 支持 DOCX 中的图片嵌入：

1. **图片存储**: 图片文件存储在 `word/media/` 目录
2. **图片引用**: 通过 `<w:drawing>` 或 `<w:pict>` 元素引用
3. **图片属性**:
   - 宽度和高度
   - 对齐方式
   - 文字环绕方式

#### Scenario: 提取嵌入图片
- **WHEN** 解析包含图片的文档
- **THEN** 系统能够从 word/media/ 提取图片并在编辑器中正确显示

### Requirement: 样式系统支持

系统 SHALL 支持 DOCX 的样式系统：

1. **样式类型**:
   - 段落样式（Paragraph Styles）
   - 字符样式（Character Styles）
   - 表格样式（Table Styles）
   - 列表样式（Numbering Styles）

2. **样式继承**:
   - 基于（`<w:basedOn>`）关系
   - 后续段落样式（`<w:next>`）

3. **内置样式识别**:
   - 标题 1-9 (Heading 1-9)
   - 正文 (Normal)
   - 列表段落 (List Paragraph)

#### Scenario: 解析样式定义
- **WHEN** 文档使用自定义样式
- **THEN** 系统能够从 styles.xml 提取样式定义并应用到对应内容

### Requirement: 页眉页脚支持

系统 SHALL 支持 DOCX 中的页眉页脚：

1. **页眉文件**: `word/header1.xml`, `word/header2.xml`, 等
2. **页脚文件**: `word/footer1.xml`, `word/footer2.xml`, 等
3. **引用关系**: 通过 document.xml.rels 定义
4. **奇偶页不同**: 支持奇偶页不同的页眉页脚设置

#### Scenario: 提取页眉页脚内容
- **WHEN** 文档包含页眉页脚
- **THEN** 系统能够提取并在预览/编辑时显示页眉页脚内容

### Requirement: 文档属性读取

系统 SHALL 支持读取 DOCX 的文档属性：

1. **核心属性** (`docProps/core.xml`):
   - 标题（title）
   - 作者（creator/lastModifiedBy）
   - 创建时间（created）
   - 修改时间（modified）

2. **应用属性** (`docProps/app.xml`):
   - 字数统计
   - 段落数
   - 应用程序名称

#### Scenario: 读取文档元数据
- **WHEN** 打开一个 .docx 文件
- **THEN** 系统能够提取并显示文档的基本属性信息

---

## 技术实现说明

### DOCX 文件解压流程

```
.docx 文件 (ZIP)
      │
      ▼
  zip.js 解压
      │
      ▼
  提取 XML 部件
      │
      ├── [Content_Types].xml
      ├── _rels/.rels
      ├── word/document.xml
      ├── word/styles.xml
      ├── word/numbering.xml
      ├── word/media/*.*
      ├── word/header*.xml
      ├── word/footer*.xml
      └── docProps/*.xml
```

### 关键 XML 命名空间

```xml
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
            xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
            xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006">
```

### 解析注意事项

1. **编码**: DOCX 内部 XML 统一使用 UTF-8 编码
2. **关系 ID**: 使用 `r:id` 属性建立部件间引用关系
3. **兼容性**: 处理不同 Word 版本生成的 DOCX 文件
