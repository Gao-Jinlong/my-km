# 开发环境配置

## 前置要求

- Node.js 22+
- pnpm 10+
- Docker（用于 PostgreSQL 和 Redis）
- Chrome/Edge 86+（File System Access API）

---

## 安装步骤

### 1. 克隆仓库

```bash
git clone <repo-url>
cd my-km
```

### 2. 安装依赖

```bash
pnpm install
```

### 3. 启动数据库容器

```bash
docker-compose up -d postgres redis
```

### 4. 运行数据库迁移

```bash
cd apps/server
pnpm prisma:generate
pnpm prisma:migrate
```

### 5. 启动开发服务器

```bash
pnpm dev
```

---

## 访问应用

- **前端**: http://localhost:4000
- **后端 API**: http://localhost:3000
- **Swagger 文档**: http://localhost:3000/api-docs

---

## 常用命令

### 开发

```bash
pnpm dev           # 启动全部服务
pnpm dev:web       # 仅前端
pnpm dev:server    # 仅后端
pnpm dev:db        # 仅数据库容器
```

### 构建

```bash
pnpm build         # 构建全部
pnpm build:web     # 仅前端
pnpm build:server  # 仅后端
```

### 数据库

```bash
cd apps/server
pnpm prisma:generate    # 生成 Prisma 客户端
pnpm prisma:migrate     # 运行迁移
pnpm prisma:studio      # 打开 Prisma Studio
```

### 代码质量

```bash
pnpm lint          # 代码检查
pnpm lint:fix      # 自动修复
pnpm format        # 格式化
pnpm test          # 运行测试
pnpm test:coverage # 测试覆盖
```

---

## 相关文档

- [代码风格](./code-style.md) - Biome 配置和代码风格
- [工作流](./workflow.md) - 代码修改流程和提交规范

---

**最后更新**: 2026-03-30
