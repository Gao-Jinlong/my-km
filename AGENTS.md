# AI 助手工作指南

> 文档编写规范与项目导航

## 📚 文档结构

```
docs/
├── 01-product/       # 产品：vision, roadmap
├── 02-architecture/  # 架构：overview, file-system-*
├── 03-frontend/      # 前端：tech-stack, 模块文档，i18n
├── 04-backend/       # 后端：api-design, database, modules
├── 05-infrastructure/# 基础设施：dev-setup, conventions, tools
└── exec-plan/        # 长期跨 PR 任务
```

## 📝 文档读写规则

### 各目录写入规则

| 目录 | 写入内容 | 文档类型 |
|------|----------|----------|
| **01-product/** | 产品愿景、路线规划 | `vision.md`, `roadmap.md` |
| **02-architecture/** | 系统架构、文件系统设计 | `overview.md`, `file-system-*.md` |
| **03-frontend/** | 前端技术栈、模块实现 | `tech-stack.md`, `<module>.md`, `i18n.md` |
| **04-backend/** | API 设计、数据库、模块文档 | `api-design.md`, `database/*.md`, `modules/*.md` |
| **05-infrastructure/** | 开发规范、工具链、部署 | `dev-setup.md`, `conventions/*.md`, `tools/*.md` |
| **exec-plan/** | 跨 PR 任务追踪 | `<plan-name>.md` |

### 各目录读取规则

| 目录 | 入口文件 | 相关文档 |
|------|----------|----------|
| **01-product/** | `README.md` → `vision.md` | `roadmap.md` |
| **02-architecture/** | `README.md` → `overview.md` | `file-system-architecture.md`, `file-system-implementation.md` |
| **03-frontend/** | `README.md` | `workspace-view.md`, `editor.md`, `files-panel.md`, `search-panel.md`, `ai-panel.md` |
| **04-backend/** | `README.md` | `api-design.md`, `database/database-design.md`, `conventions/logging-standard.md` |
| **05-infrastructure/** | `README.md` | `dev-setup.md`, `conventions/git-commit-convention.md` |
| **exec-plan/** | `README.md` | `<plan-name>.md` |

### 文档更新原则

1. **新建功能模块** → 在对应目录创建 `<module-name>.md`
2. **修改现有功能** → 先更新对应文档，再通过 OpenSpec 实施代码变更
3. **删除功能** → 同步删除或归档相关文档

## 📝 文档规范

### 原则
1. **简洁优先** - 只写必要的信息，避免冗余
2. **代码即文档** - 代码已有注释的，文档不重复
3. **概览为主** - 文档说明"是什么"，细节看代码
4. **及时更新** - 删除过时内容，保持准确

### 禁止
- ❌ 重复代码中已有的详细说明
- ❌ 过度细分的目录结构
- ❌ 冗长的背景介绍和套话

### 代码细节约束

> ⚠️ **文档中禁止写入过多代码细节**

| 允许 | 禁止 |
|------|------|
| 接口定义（Interface/Type） | 具体函数实现 |
| API 端点定义 | 冗长的代码块 |
| 数据结构定义 | 内部逻辑细节 |
| 配置项说明 | 算法实现过程 |

**规则**:
1. 文档中**最多**只允许出现接口定义、类型定义等轻量级代码
2. 不要贴具体函数的实现代码，保持文档精简
3. 代码细节请通过阅读源码获取

## 🎯 快速导航

| 角色 | 入口文档 | 主要文档目录 |
|------|----------|--------------|
| 产品经理 | [docs/01-product/README.md](docs/01-product/README.md) | `vision.md`, `roadmap.md` |
| 前端开发 | [docs/03-frontend/README.md](docs/03-frontend/README.md) | `workspace-view.md`, `editor.md`, `files-panel.md` |
| 后端开发 | [docs/04-backend/README.md](docs/04-backend/README.md) | `api-design.md`, `database/`, `modules/` |
| 架构师 | [docs/02-architecture/README.md](docs/02-architecture/README.md) | `overview.md`, `file-system-*.md` |

## 🔧 工作流

### 开始任务
1. 查看 [docs/01-product/vision.md](docs/01-product/vision.md) - 产品愿景
2. 阅读 [docs/02-architecture/overview.md](docs/02-architecture/overview.md) - 系统架构
3. 使用 `/opsx:propose` 创建提案

### OpenSpec 命令
```bash
/opsx:propose <名称>   # 创建提案
/opsx:apply           # 实现任务
/opsx:archive         # 归档变更
```

### 代码修改规范
> ⚠️ **重要**: 涉及功能模块的代码修改时，禁止直接修改代码文件。

1. **所有功能变更** 必须通过 OpenSpec 工作流进行
2. **直接修改代码** 仅限于:
   - 文档修正
   - 配置文件调整
   - 非功能性的格式修复
3. **功能模块修改** 必须:
   - 使用 `/opsx:propose` 创建变更提案
   - 通过 `/opsx:apply` 实现变更
   - 完成后用 `/opsx:archive` 归档

## 📋 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | Next.js 16 + React 19 + Tailwind CSS 4 |
| 后端 | NestJS 11 + Prisma + PostgreSQL + pgvector |
| 质量 | Biome + Husky |
| 数据库 | PostgreSQL 15 + pgvector, Redis |

---
**更新**: 2026-03-22
