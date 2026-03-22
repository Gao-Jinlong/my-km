# 基础设施文档索引

> 开发环境、工具链、部署指南

## 📚 文档目录

### 开发环境

| 文档 | 说明 | 状态 |
|------|------|------|
| [开发环境配置](./dev-setup.md) | 环境搭建和配置指南 | 📝 待编写 |
| [Docker 部署](./docker-deployment.md) | Docker Compose 部署指南 | 📝 待编写 |

### 开发规范

| 文档 | 说明 | 状态 |
|------|------|------|
| [Git 提交规范](./conventions/git-commit-convention.md) | Commit Message 规范 | ✅ 完成 |
| [代码规范](./conventions/code-style.md) | Biome 配置和代码风格 | 📝 待编写 |
| [日志规范](./conventions/logging-standard.md) | 日志级别和格式 | ✅ 完成 |

### 工具链

| 文档 | 说明 | 状态 |
|------|------|------|
| [Biome](./tools/biome.md) | Linting + Formatting | 📝 待编写 |
| [Husky](./tools/husky.md) | Git Hooks 管理 | 📝 待编写 |
| [Turbo](./tools/turbo.md) | Monorepo 构建工具 | 📝 待编写 |

### 部署

| 文档 | 说明 | 状态 |
|------|------|------|
| [部署指南](./deployment/guide.md) | 生产环境部署 | 📝 待编写 |
| [环境变量](./deployment/environment.md) | 环境变量配置 | 📝 待编写 |

---

## 🛠️ 核心工具

### 代码质量

```bash
# 代码检查
pnpm lint

# 自动修复
pnpm lint:fix

# 格式化
pnpm format

# 完整检查
pnpm check:all
```

### 开发工作流

```bash
# 启动所有服务
pnpm dev

# 单独启动
pnpm dev:web     # 前端 :4000
pnpm dev:server  # 后端 :3001
pnpm dev:db      # 数据库容器
```

### 测试

```bash
# 运行测试
pnpm test

# 测试覆盖
pnpm test:coverage
```

---

## 📦 Monorepo 结构

```
my-km/
├── apps/
│   ├── web/           # Next.js 前端
│   └── server/        # NestJS 后端
├── packages/
│   ├── prisma/        # Prisma ORM 封装
│   └── shared/        # 共享代码
├── docs/              # 文档
├── openspec/          # OpenSpec 变更管理
└── docker-compose.yml # Docker 配置
```

---

## 🔗 相关文档

- [产品文档](../01-product/README.md) - 产品规格
- [架构文档](../02-architecture/README.md) - 系统设计
- [前端文档](../03-frontend/README.md) - 前端实现
- [后端文档](../04-backend/README.md) - API 和数据库

---

**文档版本**: 1.0.0
**最后更新**: 2026-03-22
