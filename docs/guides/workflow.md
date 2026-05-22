# 开发工作流

## 代码修改流程

1. 明确修改目标 — 功能、修复、重构还是文档
2. 确认影响范围 — 涉及哪些模块和文件
3. 实施修改 — 保持小步提交，每步可验证
4. 运行测试 — 确保无回归

### 多步骤任务

对于涉及多个文件/模块的变更，建议：
- 先编写设计文档到 `docs/plans/`
- 按依赖顺序分步实施
- 每步完成后验证构建和测试通过

---

## 测试

```bash
# 运行所有测试
pnpm test

# 测试覆盖
pnpm test:coverage

# 运行特定测试
pnpm test -- apps/web/src/features/editor
```

---

## 贡献流程

1. Fork 仓库
2. 创建功能分支 (`git checkout -b feature/amazing-feature`)
3. 实施变更
4. 运行测试确保通过
5. 提交代码（遵循提交规范）
6. 创建 Pull Request

---

## 技术栈

| 领域 | 技术 |
|------|------|
| **前端** | Next.js 16 + React 19 + Tailwind CSS 4 + shadcn/ui |
| **后端** | NestJS 11 + Prisma + PostgreSQL + pgvector |
| **缓存** | Redis + cache-manager |
| **质量** | Biome + Jest + Vitest + Playwright |

---

## 相关文档

- [开发环境](./dev-setup.md) - 开发环境配置
- [代码风格](./code-style.md) - Biome 配置和提交规范

---

**最后更新**: 2026-05-22
