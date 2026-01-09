# 代码质量工具迁移指南

## 📝 概述

项目已从 **ESLint + Prettier** 迁移到 **Biome + Oxlint**，这是基于 Rust 实现的新一代代码质量工具链。

## 🚀 为什么要迁移？

### 性能提升
- **Biome**: 比 ESLint + Prettier 快 **10-100 倍**
- **Oxlint**: 比 ESLint 快 **50-100 倍**
- 单个命令即可完成 lint + format + import sorting

### 功能对比

| 功能 | ESLint + Prettier | Biome |
|------|------------------|-------|
| Linting | ✅ | ✅ |
| Formatting | ✅ | ✅ |
| Import Sorting | 需要额外插件 | ✅ 内置 |
| 配置文件 | 多个 | 单个 `biome.json` |
| 性能 | 慢（JavaScript） | 快（Rust） |
| 兼容性 | - | 兼容 ESLint 规则 |

## 📦 安装

### Biome
```bash
# 通过 pnpm 安装（推荐在项目根目录）
pnpm add -D -w @biomejs/biome
```

### Oxlint（可选）
```bash
# 通过 pnpm 安装（推荐在项目根目录）
pnpm add -D -w oxlint
```

## ⚙️ 配置文件

### Biome 配置
位置: `biome.json`（项目根目录）

```json
{
  "formatter": {
    "indentStyle": "space",
    "indentWidth": 2,
    "lineWidth": 100,
    "lineEnding": "lf"
  },
  "linter": {
    "rules": {
      "recommended": true
    }
  }
}
```

### Oxlint 配置
位置: `.oxlintignore`（项目根目录）

Oxlint 是零配置的，但可以通过 `.oxlintignore` 忽略文件。

## 🎯 使用方法

### 根目录命令

```bash
# 检查代码（只检查不修复）
pnpm lint

# 自动修复问题
pnpm lint:fix

# 格式化代码
pnpm format

# 完整检查（修复 + 额外的 oxlint 检查）
pnpm check
pnpm check:all
```

### 子项目命令

所有子项目（apps/web, apps/server, packages/ui, packages/shared）都支持以下命令：

```bash
# 在特定目录下执行
cd apps/web
pnpm lint         # 检查代码
pnpm lint:fix     # 自动修复
pnpm format       # 格式化
```

### Turbo 命令

```bash
# 检查所有子项目
turbo run lint

# 格式化所有子项目
turbo run format
```

## 🔄 Git Hooks

项目使用 Husky + lint-staged，在提交前自动运行 Biome：

```json
// package.json
"lint-staged": {
  "*.{ts,tsx,js,jsx,json,md}": [
    "biome check --write --no-errors-on-unmatched"
  ]
}
```

## 📋 规则配置

### Biome 规则

项目启用了以下规则组：
- ✅ `recommended`: 推荐规则
- ✅ `a11y`: 无障碍规则
- ✅ `correctness`: 正确性规则
- ✅ `complexity`: 复杂度规则
- ✅ `style`: 代码风格规则
- ✅ `suspicious`: 可疑代码规则
- ✅ `performance`: 性能规则
- ✅ `security`: 安全规则

### 特殊规则

```json
{
  "linter": {
    "rules": {
      "correctness": {
        "noUnusedVariables": "error",
        "noUnusedImports": "error"
      },
      "suspicious": {
        "noExplicitAny": "warn"
      },
      "nursery": {
        "useSortedClasses": "warn"  // Tailwind 类名排序
      }
    }
  }
}
```

## 🔧 IDE 集成

### VSCode

推荐安装官方扩展：
- **Biome**: `biomejs.biome`
- **Oxlint**: `wwdxbuoxlint`（可选）

### VSCode 设置

在 `.vscode/settings.json` 中添加：

```json
{
  "editor.defaultFormatter": "biomejs.biome",
  "editor.formatOnSave": true,
  "editor.codeActionsOnSave": {
    "quickfix.biome": "explicit",
    "source.organizeImports.biome": "explicit"
  },
  "[javascript]": {
    "editor.defaultFormatter": "biomejs.biome"
  },
  "[typescript]": {
    "editor.defaultFormatter": "biomejs.biome"
  },
  "[javascriptreact]": {
    "editor.defaultFormatter": "biomejs.biome"
  },
  "[typescriptreact]": {
    "editor.defaultFormatter": "biomejs.biome"
  }
}
```

## 🚫 已移除的配置

以下配置文件已不再使用（可以删除）：
- ❌ `.eslintrc.*`
- ❌ `.prettierrc*`
- ❌ `eslint.config.*`
- ❌ `.prettierignore`

⚠️ **注意**: 可以暂时保留这些文件以防回滚，但确认无问题后建议删除。

## 📚 常见问题

### Q: Biome 会完全替代 ESLint 吗？
A: 是的，Biome 可以替代 ESLint + Prettier 的所有功能。如果需要额外的规则检查，可以配合 Oxlint 使用。

### Q: 如何忽略某些文件？
A: 在 `biome.json` 的 `files.ignore` 中配置：
```json
{
  "files": {
    "ignore": ["node_modules", "dist", "*.min.js"]
  }
}
```

### Q: 如何禁用某个规则？
A: 在 `biome.json` 中配置：
```json
{
  "linter": {
    "rules": {
      "style": {
        "noConsole": "off"
      }
    }
  }
}
```

### Q: 为什么保留 Prettier 依赖？
A: 可以在迁移完成后从 `package.json` 中移除 `prettier` 依赖。

## 📖 参考资料

- [Biome 官方文档](https://biomejs.dev/)
- [Oxlint 官方文档](https://oxlint.com/)
- [Biome vs ESLint 对比](https://biomejs.dev/blog/annoucing-biome/)

---

**最后更新**: 2026-01-09
**版本**: 1.0.0
