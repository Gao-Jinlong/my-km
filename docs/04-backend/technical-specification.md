# 个人知识库系统 - 技术规格文档

## 📌 项目概述

### 核心功能

- **文章管理**: 创建、编辑、删除、查看文章
- **分类和标签**: 多维度组织和检索知识
- **全文搜索**: 基于语义向量的智能搜索
- **Markdown 编辑器**: 实时预览的编辑体验
- **AI 问答**: 基于文档内容的智能问答（RAG）
- **AI 辅助编辑**: 内容润色、总结、扩写等

---

## 🛠️ 技术栈

### 整体架构

- **Monorepo**: pnpm workspace
- **语言**: TypeScript 5+
- **代码规范**: Biome + Husky（Rust 实现，超高性能）

### Web 端

- **框架**: Next.js 16 (App Router)
- **UI**: shadcn/ui + Tailwind CSS 4
- **状态管理**: Zustand
- **表单**: React Hook Form + Zod
- **HTTP**: ky
- **React**: 19.2.3

### Server 端

- **框架**: NestJS 11
- **ORM**: Prisma
- **数据库**: PostgreSQL 15 + pgvector
- **API 文档**: Swagger
- **验证**: class-validator

### AI 集成

- **LLM 提供商**: 阿里云 / 智谱AI
- **Embedding**: 各厂商嵌入模型
- **向量存储(待定)**: PostgreSQL + pgvector

### 代码质量工具（Rust 实现）

#### Biome

- **功能**: Linting + Formatting + Import Sorting
- **性能**: 比 ESLint + Prettier 快 **10-100 倍**
- **特性**:
  - 统一的配置文件 `biome.json`
  - 超快的处理速度（Rust 编写）
  - 兼容 ESLint 规则
  - 内置代码格式化
  - 自动修复问题

#### 配置示例

```json
{
  "scripts": {
    "lint": "biome check .",
    "lint:fix": "biome check --write .",
    "format": "biome format --write .",
    "check": "biome check --write ."
  }
}
```

---

## 📁 项目结构

```
my-km/
├── apps/
│   ├── web/          # Next.js 前端
│   └── server/       # NestJS 后端
├── packages/
│   ├── shared/       # 共享类型和工具
│   └── ui/           # 共享 UI 组件
├── docs/             # 项目文档
└── docker-compose.yml
```

---

## 🗄️ 数据库设计

详细的数据库表结构、关系和索引设计请参阅：

📄 **[数据库设计文档](./database-design.md)**

核心表包括：
- Article（文章）
- Category（分类）
- Tag（标签）
- ArticleTag（文章标签关联）
- ChatSession（AI 对话会话）
- ChatMessage（AI 对话消息）
- SearchHistory（搜索历史）

---

## 🔌 API 设计

详细的 API 设计规范、端点定义和数据格式请参阅：

📄 **[API 设计规范](./api-design.md)**

主要模块：
- 文章管理 API
- 分类和标签 API
- 搜索 API
- AI 问答 API
- AI 辅助编辑 API

完整 API 文档启动后端后访问：`http://localhost:3001/api/docs`

---

## 🚀 开发指南

### 安装依赖

```bash
pnpm install
```

### 启动开发服务器

```bash
# 启动所有服务
pnpm dev

# 或分别启动
pnpm --filter web dev
pnpm --filter server start:dev
```

### 数据库迁移

```bash
cd apps/server
pnpm prisma:generate
pnpm prisma:migrate
```

### 代码检查和格式化

使用 Biome（推荐）：

```bash
# 检查代码
pnpm lint
pnpm biome check .

# 自动修复
pnpm lint:fix
pnpm biome check --write .

# 格式化代码
pnpm format
pnpm biome format --write .
```

使用 Oxlint（可选）：

```bash
# 额外的 lint 检查
npx oxlint
```

---

## 🐳 Docker 部署

```bash
# 启动所有服务（包括数据库）
docker-compose up -d

# 查看日志
docker-compose logs -f

# 停止服务
docker-compose down
```

---

## 📚 参考资料

### 官方文档

- [Next.js](https://nextjs.org/docs)
- [NestJS](https://docs.nestjs.com)
- [Prisma](https://www.prisma.io/docs)
- [shadcn/ui](https://ui.shadcn.com)

### 代码质量工具

- [Biome](https://biomejs.dev/) - 快速的 Linter 和 Formatter
- [Oxlint](https://oxlint.com/) - 超快的 JavaScript Linter

### AI 供应商

- [智谱AI 开放平台](https://open.bigmodel.cn/dev/api)
- [阿里云百炼平台](https://help.aliyun.com/zh/model-studio/)
- [OpenAI API](https://platform.openai.com/docs)

### 规范文档

- [API 设计规范](./api-design.md)
- [数据库设计](./database-design.md)
- [日志规范](./logging-standard.md)
- [Git 提交规范](./git-commit-convention.md)


---
**文档版本**: 3.1.0
**最后更新**: 2026-01-12
**状态**: 基础框架已完成，引入 Rust 工具链
