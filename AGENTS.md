# Agents 工作指南

> my-km 项目文档索引 — 按需读取，避免冗余

---

## 初次接触

| 文档 | 摘要 |
|------|------|
| [docs/architecture/overview.md](docs/architecture/overview.md) | 系统整体架构：前后端分层、模块关系、技术栈 |
| [docs/guides/dev-setup.md](docs/guides/dev-setup.md) | 开发环境配置：安装、数据库、启动命令 |

## 前端开发

| 文档 | 摘要 |
|------|------|
| [docs/frontend/architecture.md](docs/frontend/architecture.md) | 前端分层架构：platform / features / components |
| [docs/frontend/platform/services.md](docs/frontend/platform/services.md) | DI 容器和服务注册机制 |
| [docs/guides/code-style.md](docs/guides/code-style.md) | 代码风格规范 |

## 后端开发

| 文档 | 摘要 |
|------|------|
| [docs/backend/architecture.md](docs/backend/architecture.md) | 后端架构：API 设计、数据层、服务组织 |

## 调试与排障

| 文档 | 摘要 |
|------|------|
| [docs/guides/workflow.md](docs/guides/workflow.md) | 开发工作流和分支策略 |
| [docs/guides/debug-with-handoff.md](docs/guides/debug-with-handoff.md) | 使用 browse 测试涉及原生文件选择器的功能 |

## 实施记录

| 文档 | 摘要 |
|------|------|
| [docs/plan/](docs/plan/) | 开发计划和实施记录（编辑器核心、架构重构等） |

## 参考

| 文档 | 摘要 |
|------|------|
| [docs/tech-debt.md](docs/tech-debt.md) | 已知技术债务和待优化项 |
| [docs/guides/keyboard-shortcut-enums.md](docs/guides/keyboard-shortcut-enums.md) | 快捷键和条件枚举类型使用指南 |
| [docs/guides/file-search-shortcut.md](docs/guides/file-search-shortcut.md) | 文件搜索快捷键的条件服务 + 事件总线架构 |

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

## 注意事项

- **按需读取**: 根据任务场景只读对应分区，避免一次性加载全部文档
- **文档更新**: 修改功能后同步更新相关文档
- **版本**: `VERSION` 文件 / `CHANGELOG.md`
