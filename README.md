# 个人知识库系统

一个智能的个人知识管理工具，支持文章管理、智能搜索和 AI 辅助功能。

## 🚀 快速开始

### 前置要求

- Node.js 22+
- pnpm 8+
- Docker（用于 PostgreSQL）

### 安装

```bash
# 克隆仓库
git clone <repository-url>
cd my-km

# 安装依赖
pnpm install

# 启动数据库
docker-compose up -d postgres

# 运行数据库迁移
cd apps/server
pnpm prisma:generate
pnpm prisma:migrate
cd ../..

# 启动开发服务器
pnpm dev
```

### 访问

- **前端**: http://localhost:4000
- **后端 API**: http://localhost:3001
- **Swagger 文档**: http://localhost:3001/api

## 📚 文档

详细文档请查看 [docs/](./docs/README.md)

- [产品规划](./docs/spec/roadmap.md)
- [技术规格文档](./docs/technical/technical-specification.md)
- [基础设施 TODO](./docs/technical/infrastructure-todo.md)

## 🛠️ 技术栈

- **前端**: Next.js 16 + React 19 + Tailwind CSS 4
- **后端**: NestJS 11 + Prisma
- **数据库**: PostgreSQL + pgvector
- **代码质量**: Biome + Husky

## 📝 开发指南

### 可用脚本

```bash
# 启动所有服务
pnpm dev

# 启动 Web 开发服务器
pnpm dev:web

# 启动 Server 开发服务器
pnpm dev:server

# 代码检查
pnpm lint

# 代码格式化
pnpm format

# 运行测试
pnpm test

# 构建所有包
pnpm build
```

### 相关文档

- [技术规格文档](./docs/technical/technical-specification.md)
- [环境变量配置](./.env.example)
- [Git 提交规范](./docs/technical/git-commit-convention.md)

## 📄 许可证

MIT
