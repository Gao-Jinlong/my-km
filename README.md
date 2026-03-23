# 个人知识库系统 (my-km)

> AI 原生的个人知识工作室

一个智能的个人知识管理工具，支持文章管理、智能搜索和 AI 辅助功能。

## 🚀 快速开始

### 前置要求

- Node.js 22+
- pnpm 8+
- Docker（用于 PostgreSQL）

### 安装

```bash
# 安装依赖
pnpm install

# 启动数据库
docker-compose up -d postgres

# 运行数据库迁移
cd apps/server && pnpm prisma:generate && pnpm prisma:migrate && cd ../..

# 启动开发服务器
pnpm dev
```

### 访问

- **前端**: http://localhost:4000
- **后端 API**: http://localhost:3001

### 打开项目

1. 访问工作区页面后，会显示欢迎页面
2. 点击"打开项目"按钮
3. 选择一个文件夹作为项目目录
4. 系统会缓存该目录句柄并开始使用

**注意**: 项目打开功能使用 File System Access API，仅在 Chrome 86+ 或 Edge 86+ 浏览器中可用。

## 🛠️ 技术栈

| 领域 | 技术 |
|------|------|
| **前端** | Next.js 16 + React 19 + Tailwind CSS 4 + shadcn/ui |
| **后端** | NestJS 11 + Prisma |
| **数据库** | PostgreSQL + pgvector |
| **缓存** | Redis + cache-manager |

## 📝 常用命令

```bash
pnpm dev        # 启动开发服务器
pnpm lint       # 代码检查
pnpm test       # 运行测试
pnpm build      # 构建项目
```

## 📚 文档

- [产品文档](docs/01-product/README.md) - 产品愿景、需求、路线图
- [架构文档](docs/02-architecture/README.md) - 系统架构、设计模式
- [前端文档](docs/03-frontend/README.md) - 技术栈、组件、模块
- [后端文档](docs/04-backend/README.md) - API、数据库、规范

## 🎯 核心特性

- 🗂️ **项目化管理**: 系统化组织知识，而非碎片化笔记
- 🤖 **AI 深度对话**: 从零开始，AI 帮助搭建知识框架
- 🔗 **智能引用网络**: 构建知识图谱，发现隐秘关联

## 📄 许可证

MIT
