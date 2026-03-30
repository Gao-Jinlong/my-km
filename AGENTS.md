# Agents 工作指南

> my-km 项目文档索引 - 按需读取，避免冗余

**最后更新**: 2026-03-30
**当前版本**: 0.1.0

---

## 📚 文档结构

```
docs/
├── architecture/     # 架构文档
│   └── overview.md   # 系统架构概览
├── frontend/         # 前端文档
│   ├── architecture.md  # 前端架构详解
│   └── platform/     # Platform 层文档
│       └── services.md   # DI 容器和服务注册
├── backend/          # 后端文档
│   └── architecture.md  # 后端架构详解
├── guides/           # 开发指南
│   ├── dev-setup.md  # 开发环境配置
│   ├── code-style.md # 代码风格
│   └── workflow.md   # 开发工作流
└── specs/            # 规范文档
```

---

## 🤖 Agents 按需读取指南

### 场景 1: 理解项目架构

**读取顺序**:
1. `docs/architecture/overview.md` - 系统概览
2. `docs/frontend/architecture.md` - 前端架构（如需要）
3. `docs/frontend/platform/services.md` - Platform 服务（如需要）
4. `docs/backend/architecture.md` - 后端架构（如需要）

### 场景 2: 开始开发新功能

**读取顺序**:
1. `docs/guides/dev-setup.md` - 环境配置
2. `docs/guides/workflow.md` - 开发流程
3. `docs/guides/code-style.md` - 代码风格
4. 相关架构文档（根据功能模块）

### 场景 3: 修改现有功能

**读取顺序**:
1. 相关架构文档（frontend/、frontend/platform/、backend/）
2. `docs/guides/workflow.md` - OpenSpec 工作流

### 场景 4: 代码 Review

**读取顺序**:
1. `docs/guides/code-style.md` - 代码规范
2. `docs/guides/workflow.md` - 提交流程
3. 相关架构文档

---

## 📋 快速参考表

### 核心文档索引

| 文档 | 用途 | 何时读取 |
|------|------|----------|
| [docs/architecture/overview.md](docs/architecture/overview.md) | 系统架构总览 | 初次接触项目、理解整体架构 |
| [docs/frontend/architecture.md](docs/frontend/architecture.md) | 前端架构详解 | 开发前端功能、理解编辑器 |
| [docs/frontend/platform/services.md](docs/frontend/platform/services.md) | Platform 服务 | 开发服务、理解 DI 容器 |
| [docs/backend/architecture.md](docs/backend/architecture.md) | 后端架构详解 | 开发 API、理解数据模型 |
| [docs/guides/dev-setup.md](docs/guides/dev-setup.md) | 开发环境配置 | 新开发者入门 |
| [docs/guides/code-style.md](docs/guides/code-style.md) | 代码风格 | 提交代码前检查 |
| [docs/guides/workflow.md](docs/guides/workflow.md) | 开发工作流 | 开始开发前 |

---

## 🔧 OpenSpec 工作流

所有功能变更必须通过 OpenSpec 工作流：

```bash
/opsx:propose <名称>   # 创建变更提案
/opsx:apply           # 实现变更
/opsx:archive         # 归档变更
```

**跳过条件**: 仅文档修正、配置调整、非功能性修复可跳过。

---

## 📦 Monorepo 结构

```
my-km/
├── apps/
│   ├── web/           # Next.js 前端
│   └── server/        # NestJS 后端
├── packages/
│   ├── prisma/        # Prisma schema
│   └── shared/        # 共享代码
├── docs/              # 文档
├── openspec/          # OpenSpec 变更管理
└── skills/            # AI 辅助脚本
```

---

## 🚀 快速开始

```bash
# 安装依赖
pnpm install

# 启动数据库
docker-compose up -d postgres redis

# 运行迁移
cd apps/server && pnpm prisma:generate && pnpm prisma:migrate

# 启动开发服务器
pnpm dev
```

**访问**:
- 前端：http://localhost:4000
- 后端：http://localhost:3001
- Swagger: http://localhost:3001/api-docs

---

## 📝 其他文档

### 开发记录
- `docs/implementation-summary-2026-03-30.md` - 前端迭代总结
- `docs/development/2026-03-25-rich-text-editor.md` - 富文本编辑器开发记录

### 实施计划
- `docs/superpowers/plans/` - Superpowers 实施计划

### 变更档案
- `openspec/changes/archive/` - OpenSpec 归档变更

---

## ⚠️ 注意事项

1. **按需读取**: 本索引设计用于避免 agents 一次性加载所有文档
2. **文档更新**: 修改功能后，请同步更新相关文档
3. **版本管理**: 查看 `VERSION` 文件获取当前版本号
4. **变更日志**: 查看根目录 `CHANGELOG.md` 获取版本历史
