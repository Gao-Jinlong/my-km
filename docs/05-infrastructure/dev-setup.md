# 开发环境配置指南

> 快速搭建 my-km 项目的开发环境

## 📋 前置要求

### 必需软件

| 软件 | 版本 | 用途 |
|------|------|------|
| **Node.js** | 22+ | 运行时环境 |
| **pnpm** | 8+ | 包管理器 |
| **Docker** | 20+ | 容器运行（数据库） |
| **Git** | 2.0+ | 版本控制 |

### 检查版本

```bash
node --version    # v22.x.x
pnpm --version    # 10.x.x
docker --version  # Docker 20.x.x
```

---

## 🚀 快速开始

### 1. 克隆项目

```bash
git clone <repository-url>
cd my-km
```

### 2. 安装依赖

```bash
pnpm install
```

### 3. 配置环境变量

```bash
# 复制环境变量模板
cp .env.example .env

# 编辑 .env 文件，配置必要的变量
# - DATABASE_URL (默认：postgresql://kmuser:kmpass@localhost:5432/km_db)
# - JWT_SECRET (生成随机密钥)
```

### 4. 启动数据库

```bash
# 使用 Docker Compose 启动 PostgreSQL 和 Redis
docker-compose up -d postgres redis

# 检查容器状态
docker-compose ps
```

### 5. 运行数据库迁移

```bash
cd apps/server
pnpm prisma:generate
pnpm prisma:migrate
cd ../..
```

### 6. 启动开发服务器

```bash
# 启动所有服务（前端 + 后端）
pnpm dev

# 或分别启动
pnpm dev:web     # 前端 http://localhost:4000
pnpm dev:server  # 后端 http://localhost:3001
```

---

## 🛠️ 开发工具

### 可用脚本

```bash
# 开发
pnpm dev              # 启动所有服务
pnpm dev:all          # 同上
pnpm dev:web          # 仅前端
pnpm dev:server       # 仅后端
pnpm dev:db           # 仅数据库

# 代码质量
pnpm lint             # Biome 检查
pnpm lint:fix         # 自动修复
pnpm format           # 格式化代码
pnpm check:all        # Biome + oxlint

# 测试
pnpm test             # 运行所有测试
pnpm test:watch       # 监视模式
pnpm test:coverage    # 生成覆盖率

# 构建
pnpm build            # 构建所有包
pnpm clean            # 清理构建产物
```

### IDE 推荐配置

#### VS Code 扩展

- **Biome** - 代码检查和格式化
- **ESLint** - 备用 lint 工具
- **Prisma** - Prisma 语法支持
- **Tailwind CSS IntelliSense** - Tailwind 自动补全

#### 设置

```json
{
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "biomejs.biome",
  "editor.codeActionsOnSave": {
    "source.fixAll.biome": true
  }
}
```

---

## 📦 Docker 服务

### 服务列表

| 服务 | 容器名 | 端口 | 说明 |
|------|--------|------|------|
| **PostgreSQL** | km-postgres | 5432 | 主数据库（含 pgvector） |
| **Redis** | km-redis | 6379 | 缓存服务 |

### 常用命令

```bash
# 启动所有服务
docker-compose up -d

# 查看日志
docker-compose logs -f

# 停止服务
docker-compose down

# 重置数据库
docker-compose down -v
docker-compose up -d postgres
```

### 数据库连接

```bash
# 本地连接
psql -h localhost -U kmuser -d km_db

# Docker 内连接
docker exec -it km-postgres psql -U kmuser -d km_db
```

---

## 🔧 常见问题

### 1. pnpm 安装失败

```bash
# 更新 pnpm
npm install -g pnpm

# 清除缓存
pnpm store prune

# 重新安装
rm -rf node_modules pnpm-lock.yaml
pnpm install
```

### 2. Docker 容器启动失败

```bash
# 检查端口占用
lsof -i :5432
lsof -i :6379

# 重启 Docker
docker-compose down
docker-compose up -d
```

### 3. Prisma 迁移失败

```bash
# 重置数据库
cd apps/server
pnpm prisma:migrate reset
pnpm prisma:generate
```

---

## 📚 相关文档

- [Git 提交规范](./conventions/git-commit-convention.md)
- [代码规范](./conventions/code-style.md)
- [日志规范](../04-backend/conventions/logging-standard.md)
- [Docker 部署](./docker-deployment.md)

---

**文档版本**: 1.0.0
**最后更新**: 2026-03-22
