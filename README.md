# 我的知识库 (My KM)

一个基于 Next.js 和 NestJS 的个人知识管理系统，支持文章管理、智能搜索、AI 问答等功能。

## 📋 项目简介

这是一个使用 pnpm + Monorepo 架构的个人知识库系统，包含以下核心功能：

- 📝 **文章管理**: 创建、编辑、删除、查看文章
- 🏷️ **分类和标签**: 多维度组织知识
- 🔍 **智能搜索**: 基于语义向量的全文搜索
- 🤖 **AI 问答**: 基于文档内容的智能问答（RAG）
- ✨ **AI 辅助编辑**: 内容润色、总结、扩写等
- 📄 **Markdown 编辑**: 实时预览的 Markdown 编辑体验

## 🛠️ 技术栈

### 前端 (apps/web)
- **框架**: Next.js 14 (App Router)
- **语言**: TypeScript
- **UI 组件**: shadcn/ui
- **样式**: Tailwind CSS
- **状态管理**: Zustand
- **表单**: React Hook Form + Zod

### 后端 (apps/server)
- **框架**: NestJS 11
- **语言**: TypeScript (严格模式)
- **ORM**: Prisma 6
- **数据库**: PostgreSQL + pgvector
- **API 文档**: Swagger
- **验证**: class-validator + class-transformer
- **日志**: NestJS 内置 Logger
- **AI 集成**: 智谱AI / 阿里云

### 共享包 (packages)
- **shared**: 共享类型定义、常量、工具函数
- **ui**: 共享 UI 组件库

## 📦 项目结构

```
my-km/
├── apps/
│   ├── web/              # Next.js 前端应用
│   └── server/           # NestJS 后端应用
├── packages/
│   ├── shared/           # 共享类型和工具
│   └── ui/               # 共享 UI 组件
├── docs/                 # 项目文档
├── docker-compose.yml    # Docker Compose 配置
├── pnpm-workspace.yaml   # pnpm workspace 配置
└── package.json          # 根 package.json
```

## 🚀 快速开始

### 环境要求

- Node.js >= 18.x
- pnpm >= 8.x
- PostgreSQL 15+ (或使用 Docker)

### 1. 克隆项目

```bash
git clone <your-repo-url>
cd my-km
```

### 2. 安装依赖

```bash
# 安装 pnpm (如果尚未安装)
npm install -g pnpm

# 安装项目依赖
pnpm install
```

### 3. 配置环境变量

#### Web 应用

复制 `apps/web/.env.local.example` 到 `apps/web/.env.local`:

```bash
cp apps/web/.env.local.example apps/web/.env.local
```

#### Server 应用

复制 `apps/server/.env.example` 到 `apps/server/.env`:

```bash
cp apps/server/.env.example apps/server/.env
```

编辑 `.env` 文件，配置数据库和 AI 服务：

```env
# 数据库
DATABASE_URL="postgresql://user:password@localhost:5432/km_db"

# AI 服务（智谱AI）
ZHIPUAI_API_KEY=your_api_key
AI_PROVIDER=zhipu
```

### 4. 启动数据库

#### 使用 Docker Compose (推荐)

```bash
# 仅启动数据库
docker-compose up -d postgres

# 查看日志
docker-compose logs -f postgres
```

#### 或使用本地 PostgreSQL

确保已安装 PostgreSQL 并创建数据库：

```sql
CREATE DATABASE km_db;
```

### 5. 初始化数据库

```bash
cd apps/server

# 生成 Prisma Client
pnpm prisma:generate

# 运行数据库迁移
pnpm prisma:migrate

# (可选) 填充初始数据
pnpm prisma:seed
```

### 6. 启动开发服务器

在项目根目录运行：

```bash
# 同时启动前后端
pnpm dev

# 或分别启动
pnpm --filter web dev      # 前端: http://localhost:3000
pnpm --filter server start:dev  # 后端: http://localhost:3001
```

### 7. 访问应用

- **前端**: http://localhost:3000
- **后端 API**: http://localhost:3001
- **API 文档**: http://localhost:3001/api/docs

## 🐳 使用 Docker

如果不想手动配置环境，可以使用 Docker Compose 一键启动所有服务：

```bash
# 启动所有服务
docker-compose up -d

# 查看日志
docker-compose logs -f

# 停止服务
docker-compose down

# 停止并删除数据卷
docker-compose down -v
```

## 📝 开发指南

### 代码规范

项目使用 **Biome** 和 **Oxlint** 进行代码检查和格式化（基于 Rust，性能提升 10-100 倍）：

```bash
# 检查代码
pnpm lint

# 自动修复问题
pnpm lint:fix

# 格式化代码
pnpm format

# 完整检查（Biome + Oxlint）
pnpm check:all
```

详细配置请参阅：[代码质量工具指南](./docs/code-quality-guide.md)

### Git 提交规范

项目使用 Husky 和 lint-staged 进行 Git 提交前检查：

```bash
feat: 新功能
fix: 修复 Bug
docs: 文档更新
style: 代码格式调整
refactor: 重构
perf: 性能优化
test: 测试相关
chore: 构建/工具相关
```

### 添加新的依赖

```bash
# 为 web 应用添加依赖
pnpm --filter web add <package-name>

# 为 server 应用添加依赖
pnpm --filter server add <package-name>

# 为共享包添加依赖
pnpm --filter shared add <package-name>
```

## 🔧 常用命令

### 根目录

```bash
pnpm dev          # 启动所有应用
pnpm build        # 构建所有应用
pnpm lint         # 检查所有应用代码
pnpm format       # 格式化所有代码
```

### Web 应用

```bash
cd apps/web
pnpm dev          # 启动开发服务器
pnpm build        # 构建生产版本
pnpm start        # 启动生产服务器
pnpm lint         # 代码检查
```

### Server 应用

```bash
cd apps/server
pnpm start:dev    # 启动开发服务器
pnpm build        # 构建
pnpm start:prod   # 启动生产服务器
pnpm lint         # 代码检查
pnpm test         # 运行测试

# Prisma 相关
npx prisma generate   # 生成 Prisma Client
npx prisma migrate dev --name init  # 运行数据库迁移
npx prisma studio     # 打开 Prisma Studio
```

### Monorepo 特定命令

```bash
# 从根目录运行特定应用
pnpm --filter web dev              # 仅启动 web 应用
pnpm --filter server start:dev     # 仅启动 server 应用

# 构建特定应用
pnpm --filter server build         # 仅构建 server
pnpm build --filter=server         # 使用 turbo 构建

# 查看依赖关系
pnpm why <package-name>            # 查看包的依赖关系
pnpm list --depth 0                # 列出所有顶层依赖
```

## 📚 文档

- [技术规格文档](./docs/technical-specification.md) - 详细的技术选型和架构设计
- [API 文档](http://localhost:3001/api/docs) - Swagger API 文档（启动后端后访问）

## 🤝 贡献指南

欢迎贡献代码、提出问题或建议！

## 📄 许可证

MIT License

---

**注意**: 此项目仅为框架，具体业务功能需要根据需求进一步开发。
