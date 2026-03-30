# 开发工作流

## 代码修改流程

### 使用 OpenSpec 工作流

**所有功能变更**必须通过 OpenSpec 工作流进行：

```bash
/opsx:propose <名称>   # 创建变更提案
/opsx:apply           # 实现变更
/opsx:archive         # 归档变更
```

**可跳过 OpenSpec 的情况**：
- 文档修正
- 配置文件调整
- 非功能性的格式修复

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
3. 使用 OpenSpec 工作流进行开发
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
| **质量** | Biome + Husky + Jest + Vitest + Playwright |

---

## 相关文档

- [开发环境](./dev-setup.md) - 开发环境配置
- [代码风格](./code-style.md) - Biome 配置和提交规范

---

**最后更新**: 2026-03-30
