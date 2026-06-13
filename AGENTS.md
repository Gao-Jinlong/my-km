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
| [docs/backend/ddd-redesign.md](docs/backend/ddd-redesign.md) | 后端 DDD 重设计方案（学习型）：Bounded Context、聚合、值对象、领域事件、迁移路径 |

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
- 后端：http://localhost:3000
- Swagger：http://localhost:3000/api-docs

## 设计系统

| 文档 | 摘要 |
|------|------|
| [docs/design-system/agent-guide.md](docs/design-system/agent-guide.md) | AI agent 快速上手指南（design-first 治理） |
| [docs/design-system/spec.md](docs/design-system/spec.md) | 设计系统完整规范（token / primitive / pattern / 工程化 / 路线图） |
| [docs/design-system/design-system.pen](docs/design-system/design-system.pen) | 唯一权威设计稿（人工维护，禁止脚本读写） |
| [docs/design-system/decisions/](docs/design-system/decisions/) | ADR 序列：0001 三段式 token、0002 双包结构、0003 API 公约、0004 primitive vs pattern |
| [packages/design-tokens/](packages/design-tokens/) | Token 工程实现（设计稿的 foundation 映射）；改 token 只动这里，跑 `pnpm tokens:build` |
| [packages/design-system/](packages/design-system/) | Primitives + patterns + Tailwind preset（骨架阶段） |
| [apps/storybook/](apps/storybook/) | 文档站；`pnpm design:storybook` 启动，`pnpm design:storybook:build` 构建静态站 |

### Design-first 源头关系

1. `design-system.pen` 是唯一权威设计稿。
2. `packages/design-tokens/src/` 实现设计稿的 foundation/theme。
3. `packages/design-system/` 实现设计稿的 primitives/patterns。
4. **如果实现与设计冲突，默认实现是错的。**
5. **任何脚本都不能读取、生成或修改 `.pen` 设计稿。**

### 三条最常违反的规则

1. **不要写裸十六进制颜色或 `bg-[#xxx]`**。颜色一律走 token：`bg-bg-primary` / `text-fg-muted` 或 `style={{ background: tokens.color.bg.primary }}`。
2. **新组件不进 `apps/web/src/components/ui/`**。primitive 进 `packages/design-system/src/primitives/`，pattern 进 `.../patterns/`，业务组件留在 `apps/web/src/components/{domain}/`。
3. **视觉变更从 `design-system.pen` 开始**：先更新设计稿，再对齐代码。不允许"先写代码再补设计"。

## 注意事项

- **按需读取**: 根据任务场景只读对应分区，避免一次性加载全部文档
- **文档更新**: 修改功能后同步更新相关文档
- **版本**: `VERSION` 文件 / `CHANGELOG.md`