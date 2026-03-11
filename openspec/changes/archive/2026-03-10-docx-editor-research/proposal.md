## Why

为个人知识库系统添加专业级 docx 文档编辑能力，使用户能够在本地环境中完整编辑和管理 Microsoft Word 文档，满足技术写作、学术研究和商务文档处理需求。当前项目仅支持 Markdown 和纯文本编辑，缺乏对主流办公文档格式的支持。

## What Changes

- 新增 docx 文档预览功能，支持在浏览器中查看 docx 文件内容
- 新增 docx 文档编辑功能，支持专业的富文本编辑体验
- 新增 docx 文档生成和导出能力，支持保存为标准 .docx 格式
- 扩展编辑器模块，支持多种文件类型切换和集成
- 集成 AI 辅助写作能力到 docx 编辑场景

## Capabilities

### New Capabilities

- `docx-format-spec`: DOCX 文件格式规范和数据结构说明，包括 OOXML/ECMA-376 标准解析
- `docx-preview-engine`: DOCX 预览引擎，支持在浏览器中渲染 docx 文档为 HTML
- `docx-editor-core`: DOCX 编辑器核心，提供富文本编辑能力和格式保持
- `docx-conversion-layer`: DOCX 转换层，支持 docx 与其他格式（Markdown、HTML）之间的双向转换
- `rich-text-editor-integration`: 富文本编辑器集成，评估和集成 ProseMirror/Tiptap 等编辑器框架

### Modified Capabilities

- `editor`: 扩展编辑器模块以支持 docx 文件类型，增加多格式编辑能力

## Impact

**技术栈影响**:
- 新增依赖：docx（文档生成）、docx-preview（预览）、mammoth（HTML 转换）、zip.js（OOXML 解压）
- 新增编辑器框架：Tiptap/ProseMirror 用于富文本编辑
- 构建工具链需支持 WASM 模块（如选用某些编辑器）

**架构影响**:
- 编辑器模块需要支持多种编辑器类型的动态切换
- 文件系统需处理 docx 二进制文件的读写和缓存
- AI 对话模块需支持对 docx 文档内容的上下文理解

**性能影响**:
- 大尺寸 docx 文件（>10MB）的加载和渲染性能
- 复杂格式文档的实时预览和编辑响应

**浏览器兼容性**:
- 需要 Chrome/Edge 86+ 以获得完整 File System API 支持
- 部分高级编辑功能可能需要较新的浏览器 API
