# Agents 工作指南

> my-km 项目文档索引 - 按需读取，避免冗余

---

## 文档索引

| 文档 | 用途 | 何时读取 |
|------|------|----------|
| [docs/architecture/overview.md](docs/architecture/overview.md) | 系统架构总览 | 初次接触项目 |
| [docs/frontend/architecture.md](docs/frontend/architecture.md) | 前端架构详解 | 开发前端功能 |
| [docs/frontend/platform/services.md](docs/frontend/platform/services.md) | DI 容器和服务注册 | 开发服务 |
| [docs/backend/architecture.md](docs/backend/architecture.md) | 后端架构详解 | 开发 API |
| [docs/guides/dev-setup.md](docs/guides/dev-setup.md) | 开发环境配置 | 新人入门 |
| [docs/guides/code-style.md](docs/guides/code-style.md) | 代码风格 | 提交代码前 |
| [docs/guides/workflow.md](docs/guides/workflow.md) | 开发工作流 | 开始开发前 |

## OpenSpec 工作流

所有功能变更必须通过 OpenSpec：

```bash
/opsx:propose <名称>   # 创建变更提案
/opsx:apply           # 实现变更
/opsx:archive         # 归档变更
```

**跳过条件**: 仅文档修正、配置调整、非功能性修复可跳过。

## 快速开始

```bash
pnpm install
docker-compose up -d postgres redis
cd apps/server && pnpm prisma:generate && pnpm prisma:migrate
pnpm dev
```

- 前端：http://localhost:4000
- 后端：http://localhost:3001
- Swagger：http://localhost:3001/api-docs

## 其他文档

- `docs/implementation-summary-2026-03-30.md` - 前端迭代总结
- `docs/development/2026-03-25-rich-text-editor.md` - 富文本编辑器开发记录
- `docs/superpowers/plans/` - Superpowers 实施计划
- `openspec/changes/archive/` - OpenSpec 归档变更

## 注意事项

- **按需读取**: 避免一次性加载所有文档
- **文档更新**: 修改功能后同步更新相关文档
- **版本**: `VERSION` 文件 / `CHANGELOG.md`
