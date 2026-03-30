# 代码风格

项目使用 Biome 进行代码检查和格式化。

---

## 命令

```bash
# 代码检查
pnpm lint

# 自动修复
pnpm lint:fix

# 格式化
pnpm format
```

---

## Git 提交规范

项目遵循 Conventional Commits 规范：

| 类型 | 说明 |
|------|------|
| `feat:` | 新功能 |
| `fix:` | Bug 修复 |
| `refactor:` | 重构 |
| `test:` | 测试相关 |
| `docs:` | 文档更新 |
| `chore:` | 构建/工具配置 |

### 示例

```
feat(editor): 实现自动保存功能
fix(auth): 修复 token 刷新逻辑
refactor: 统一使用 ServiceBase 基类
```

---

## 相关文档

- [开发环境](./dev-setup.md) - 开发环境配置
- [工作流](./workflow.md) - 代码修改流程

---

**最后更新**: 2026-03-30
