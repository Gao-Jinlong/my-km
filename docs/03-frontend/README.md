# 前端技术文档索引

> Next.js 16 + React 19 + Tailwind CSS 4

## 📚 文档目录

### 核心指南

| 文档 | 说明 |
|------|------|
| [技术栈](./guides/tech-stack.md) | 前端技术选型和配置 |
| [国际化](./guides/i18n.md) | i18n 配置和多语言支持 |

### 架构设计

| 文档 | 说明 |
|------|------|
| [架构概览](./architecture/overview.md) | 前端架构概览 |
| [工作视图](./architecture/workspace-view.md) | 工作视图整体架构 |
| [布局系统](./architecture/layout.md) | 页面布局规范 |
| [文件系统架构](./architecture/file-system-architecture.md) | 文件系统分层设计和能力模型 |
| [文件系统实现](./architecture/file-system-implementation.md) | FileSystemService 和 Provider 实现方案 |
| [文件系统设计](./architecture/file-system-design.md) | 浏览器 File System Access API 使用规范 |

### 功能模块

| 文档 | 说明 |
|------|------|
| [编辑器模块](./modules/editor.md) | 编辑器管理、Tab 系统 |
| [文件面板](./modules/files-panel.md) | 文件树、文件操作 |
| [搜索面板](./modules/search-panel.md) | 全局搜索、向量检索 |
| [AI 面板](./modules/ai-panel.md) | AI 对话面板 |
| [交互设计](./modules/interaction.md) | 用户交互规范 |

---

## 🛠️ 技术栈

| 类别 | 技术 | 说明 |
|------|------|------|
| **框架** | Next.js 16 | React 全栈框架 |
| **UI 库** | React 19 | 组件库 |
| **样式** | Tailwind CSS 4 | 原子化 CSS |
| **状态管理** | Zustand | 轻量级状态管理 |
| **国际化** | next-intl | 多语言支持 |
| **代码质量** | Biome | Linting + Formatting |

---

## 🚀 快速开始

```bash
# 启动前端开发服务器
cd apps/web
pnpm dev

# 访问 http://localhost:4000
```

---

## 📊 核心模块

- **WorkspaceView** - 工作视图容器
- **Editor** - 编辑器管理
- **Sidebar** - 侧边栏面板系统
- **FileProvider** - 文件系统提供者

---

## 🔗 相关文档

- [产品文档](../01-product/README.md) - 产品规格
- [架构文档](../02-architecture/README.md) - 系统设计
- [后端文档](../04-backend/README.md) - API 和数据库
- [基础设施](../05-infrastructure/README.md) - 开发规范

---

**文档版本**: 1.0.0
**最后更新**: 2026-03-22
