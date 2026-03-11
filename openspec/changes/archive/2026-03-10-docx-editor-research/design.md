## Context

### 背景

本项目是一个 VSCode 风格的 AI 知识工作站，当前支持 Markdown 和纯文本文件的编辑。为了支持专业级文档编辑场景（技术文档、学术论文、商务报告），需要添加对 Microsoft Word docx 格式的完整支持。

### 技术现状

**现有架构**:
- 基于 File System API 的本地文件管理
- Lexical 编辑器用于 Markdown 编辑
- IndexedDB 存储项目结构和元数据
- 纯本地存储，可选云端同步

### 约束条件

- 必须在浏览器环境中运行（无后端处理）
- 保持本地优先架构原则
- 与现有编辑器模块无缝集成
- 支持 AI 深度集成（RAG 检索、辅助写作）

## Goals / Non-Goals

**Goals:**

1. 支持在浏览器中预览 docx 文档内容
2. 支持专业级 docx 文档编辑（样式、表格、图片、页眉页脚）
3. 支持将编辑后的文档保存为标准 docx 格式
4. 支持 docx 与 Markdown/HTML 之间的格式转换
5. 与现有编辑器模块无缝集成
6. 支持 AI 辅助写作和文档分析

**Non-Goals:**

1. 不支持实时多人协作编辑（类似 Google Docs）
2. 不支持 VBA 宏和 ActiveX 控件
3. 不支持旧版 .doc 格式（仅支持 .docx）
4. 不实现完整的 Word 功能集（仅覆盖 80% 常用功能）
5. 不支持复杂布局功能（邮件合并、目录自动生成等）

## Decisions

### 1. 技术选型：使用现有库组合而非从零实现

**选择**: 采用成熟的开源库组合方案

**理由**:
- docx 格式复杂度高，完全自研成本巨大
- 现有库已覆盖大部分需求场景
- 可将精力集中在业务逻辑和用户体验上

**对比方案**:

| 方案 | 优点 | 缺点 | 结论 |
|------|------|------|------|
| 自研解析/生成引擎 | 完全可控 | 开发周期 6 个月+，维护成本高 | ❌ |
| 使用 OnlyOffice/ Collabora 开源方案 | 功能完整 | 需要后端服务，架构复杂 | ❌ |
| 纯前端库组合方案 | 轻量、符合本地优先架构 | 高级功能有限 | ✅ |

### 2. 核心库选型

#### 2.1 文档生成：docx (dolanmiu)

**选择**: `docx` npm 包

**理由**:
- TypeScript 编写，类型定义完整
- 声明式 API，易于上手
- 支持浏览器和 Node.js 双环境
- 功能覆盖全面（段落、表格、图片、页眉页脚）

**替代方案**:
- `docx4js`: 功能类似，但社区活跃度较低
- `officegen`: 仅支持生成，不支持读取

#### 2.2 文档预览：docx-preview

**选择**: `docx-preview` npm 包

**理由**:
- 专注预览场景，体积小（~50KB gzipped）
- 渲染质量高，保持 Word 格式
- 纯前端实现，无后端依赖

**替代方案**:
- `mammoth.js`: 轻量但渲染保真度低，适合纯文本提取
- 后端渲染（OnlyOffice Document Server）: 需要服务端，不符合本地优先原则

#### 2.3 富文本编辑器：Tiptap (基于 ProseMirror)

**选择**: `Tiptap` 编辑器框架

**理由**:
- 基于 ProseMirror，功能强大且稳定
- 无头（headless）架构，可完全自定义 UI
- 丰富的扩展生态系统
- 支持协作编辑（为未来预留能力）
- 与 React/Vue/Solid 等框架良好集成

**替代方案**:

| 框架 | 优点 | 缺点 | 结论 |
|------|------|------|------|
| Tiptap | 无头架构、扩展丰富 | 学习曲线中等 | ✅ 首选 |
| ProseMirror | 功能最强大 | API 复杂，学习曲线陡峭 | ⚠️ 备选 |
| Lexical | Facebook 背书、性能好 | docx 生态整合较少 | ⚠️ 备选（已用于 Markdown） |
| Slate | React 友好 | 性能问题、维护不稳定 | ❌ |
| Quill | 简单易用 | 功能有限、自定义困难 | ❌ |

#### 2.4 ZIP 处理：@zip.js/zip.js

**选择**: `@zip.js/zip.js`

**理由**:
- docx 本质是 ZIP 压缩包，需要解压处理内部 XML
- 无第三方依赖，浏览器和 Node.js 通用
- 支持流式处理，适合大文件

### 3. 架构设计：分层架构

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
│  │  (Document Schema, Nodes, Marks, Commands)      ││
│  └─────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────┘
                            │
              ┌─────────────┼─────────────┐
              ▼             ▼             ▼
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
│  Import Layer   │ │  Content Layer  │ │  Export Layer   │
│  ┌───────────┐  │ │  ┌───────────┐  │ │  ┌───────────┐  │
│  │ docx-     │  │ │  │ Tiptap    │  │ │  │ docx      │  │
│  │ preview   │  │ │  │ Document  │  │ │  │ generator │  │
│  │ mammoth   │  │ │  │ State     │  │ │  │           │  │
│  └───────────┘  │ │  └───────────┘  │ │  └───────────┘  │
└─────────────────┘ └─────────────────┘ └─────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────┐
│                  File System Layer                   │
│  ┌─────────────────────────────────────────────────┐│
│  │    File System API + IndexedDB + zip.js        ││
│  └─────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────┘
```

### 4. 数据流设计

#### 4.1 导入流程（Open .docx）

```
用户选择 .docx 文件
      │
      ▼
FileSystem API 读取 ArrayBuffer
      │
      ▼
docx-preview 解析并渲染到预览容器 (仅预览模式)
      或
mammoth 提取 HTML + docx 解析元数据
      │
      ▼
Tiptap 编辑器加载内容 (编辑模式)
      │
      ▼
编辑器状态标记为"已修改"
```

#### 4.2 导出流程（Save .docx）

```
用户点击保存
      │
      ▼
Tiptap 获取编辑器内容 (JSON/ProseMirror Model)
      │
      ▼
转换为 docx 库的文档结构
      │
      ▼
docx.Packer 生成 Blob
      │
      ▼
FileSystem API 写入磁盘
```

### 5. 编辑器 Schema 设计

Tiptap 需要自定义 Schema 以支持 docx 的核心概念：

```typescript
// 核心节点类型
const schema = {
  nodes: {
    doc: { content: 'block+' },
    paragraph: { content: 'inline*', group: 'block' },
    heading: { content: 'inline*', group: 'block', attrs: { level: { default: 1 } } },
    bulletList: { content: 'bulletListItem+', group: 'block' },
    orderedList: { content: 'orderedListItem+', group: 'block' },
    table: { content: 'tableRow+', group: 'block', isolating: true },
    tableRow: { content: '(tableCell|tableHeaderCell)+', group: 'block' },
    tableCell: { content: 'block*', isolating: true },
    image: { group: 'block', attrs: { src: {}, alt: { default: null } }, selectable: true },
  },
  marks: {
    text: {}, // 基础文本
    link: { attrs: { href: {} } },
    em: {}, // 斜体
    strong: {}, // 粗体
    underline: {}, // 下划线
    strikethrough: {}, // 删除线
    highlight: {}, // 高亮
    fontSize: { attrs: { size: {} } },
    fontFamily: { attrs: { family: {} } },
    color: { attrs: { color: {} } },
  },
}
```

## Risks / Trade-offs

### 风险 1：格式保真度损失

**描述**: 在 docx ↔ Tiptap ↔ docx 的转换过程中，部分复杂格式可能丢失或变形。

**影响**: 用户发现编辑后的文档与原始文档格式不一致。

**缓解措施**:
- 实现前进行充分的格式兼容性测试
- 对于不支持的格式，在导入时给出提示
- 保留原始格式信息作为备用（ round-trip 优化）

### 风险 2：大文件性能问题

**描述**: 复杂 docx 文件（>10MB，包含大量图片）可能导致浏览器卡顿。

**影响**: 加载时间过长，编辑响应延迟。

**缓解措施**:
- 实现虚拟滚动和懒加载
- 图片采用缩略图 + 原图分离策略
- 对超大文件给出友好提示，建议使用预览模式

### 风险 3：浏览器兼容性

**描述**: File System API 和部分编辑功能仅在较新浏览器中可用。

**影响**: Firefox/Safari 用户无法使用完整功能。

**缓解措施**:
- 提供降级方案（传统文件上传/下载）
- 明确标注推荐浏览器（Chrome/Edge 86+）
- 核心编辑功能使用标准 API，确保基本兼容

### 风险 4：依赖库维护风险

**描述**: 依赖的开源库可能停止维护或出现 breaking changes。

**影响**: 项目被迫升级或寻找替代方案。

**缓解措施**:
- 选择活跃度高、下载量大的库
- 锁定依赖版本，避免自动升级
- 核心转换逻辑抽象为独立模块，便于替换

### 风险 5：AI 集成复杂度

**描述**: docx 文档的复杂结构可能影响 AI 对内容的理解。

**影响**: AI 生成的内容格式不符合预期。

**缓解措施**:
- 实现结构化内容提取（忽略纯格式信息）
- 为 AI 生成内容定义专用 Schema
- 在转换层处理格式转换

## Migration Plan

由于这是新增功能，不涉及现有功能迁移，但需要按以下步骤实施：

1. **阶段 1 - 基础架构** (1-2 周)
   - 安装和配置核心依赖库
   - 搭建编辑器基础框架

2. **阶段 2 - 预览功能** (1 周)
   - 集成 docx-preview
   - 实现基础预览 UI

3. **阶段 3 - 编辑功能** (2-3 周)
   - 集成 Tiptap 编辑器
   - 实现核心编辑功能
   - 实现导入/导出

4. **阶段 4 - 高级功能** (1-2 周)
   - 表格、图片等复杂元素支持
   - 样式和格式化功能

5. **阶段 5 - AI 集成与优化** (1-2 周)
   - AI 辅助写作集成
   - 性能优化和测试

## Open Questions

1. **编辑器统一性**: 是否应该将 Markdown 编辑器也迁移到 Tiptap，实现编辑器统一？
   - 当前使用 Lexical 用于 Markdown
   - 统一编辑器可降低维护成本，但迁移有成本

2. **协作编辑**: 未来是否要支持多人实时协作？
   - 如需要，需提前设计 Y.js 等 CRDT 集成方案

3. **云端文档处理**: 是否考虑引入后端文档处理服务以支持更复杂场景？
   - 如 OnlyOffice Document Server 自托管

4. **格式转换精度**: 对于无法完美转换的格式，采用何种用户提示策略？
