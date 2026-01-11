# Git 提交规范

本文档定义了项目的 Git 提交消息规范，以确保提交历史清晰、一致且易于理解。

## 提交消息格式

提交消息应该遵循以下格式：

```
<type>(<scope>): <subject>

<body>

<footer>
```

### 必需部分

- **type**: 提交类型
- **subject**: 简短描述（不超过 50 个字符）

### 可选部分

- **scope**: 影响范围
- **body**: 详细描述
- **footer**: 相关信息（如关闭的 issue）

## 提交类型 (Type)

| 类型 | 说明 | 示例 |
|------|------|------|
| `feat` | 新功能 | feat: 添加用户登录功能 |
| `fix` | 修复 Bug | fix: 修复文章编辑器保存失败的问题 |
| `docs` | 文档更新 | docs: 更新 README 安装说明 |
| `style` | 代码格式调整（不影响代码运行） | style: 统一代码缩进为 2 空格 |
| `refactor` | 重构（既不是新功能也不是修复 Bug） | refactor: 重构用户服务层代码结构 |
| `perf` | 性能优化 | perf: 优化文章列表查询性能 |
| `test` | 测试相关 | test: 添加用户模块单元测试 |
| `chore` | 构建/工具相关 | chore: 升级依赖版本 |
| `ci` | CI/CD 相关配置 | ci: 添加 GitHub Actions 工作流 |
| `revert` | 回滚之前的提交 | revert: 回滚 feat:xxx |

## 提交范围 (Scope)

scope 用于说明本次提交影响的范围，例如：

- `web`: 前端应用
- `server`: 后端应用
- `shared`: 共享包
- `ui`: UI 组件包
- `database`: 数据库相关
- `auth`: 认证模块
- `article`: 文章模块

示例：
```
feat(web): 添加文章搜索功能
fix(server): 修复用户权限验证错误
docs(shared): 更新类型定义注释
```

## 详细描述 (Body)

当提交内容较复杂时，应在 body 中详细说明。应该包括：

- **做什么**: 描述本次提交的内容
- **为什么**: 说明为什么做这个改动
- **怎么做**: 如果有必要，说明实现方式

示例：
```
feat(server): 实现文章分类管理功能

- 添加 ArticleCategory 模型
- 实现分类的增删改查接口
- 支持分类层级结构（最多 3 级）
- 添加分类管理权限验证

Closes #123
```

## 提交最佳实践

### 1. Subject 规范

- 使用中文描述
- 使用动词开头（如：添加、修复、更新）
- 首字母小写
- 不以句号结尾
- 不超过 50 个字符

✅ 好的示例：
```
feat: 添加用户头像上传功能
fix: 修复文章删除时的权限问题
docs: 更新 API 文档
```

❌ 不好的示例：
```
添加用户头像上传功能。              # 不需要 type
Feat: 添加用户头像上传功能          # type 不应大写
feat: 添加用户头像上传的功能。      # 不应以句号结尾
fix: 修复了这个那个的bug          # 描述不清晰
```

### 2. Body 规范

- 每行不超过 72 个字符
- 使用列表列出关键点
- 说明 "为什么" 和 "做什么"，而不是 "怎么做"

### 3. Footer 规范

- **关闭 Issue**: 使用 `Closes #123` 或 `Fixes #456`
- **破坏性变更**: 使用 `BREAKING CHANGE:` 开头

示例：
```
feat(api): 重构用户认证接口

BREAKING CHANGE: 认证接口从 /api/auth/login 改为 /api/v1/auth/login

Closes #89
```

## 实际示例

### 简单提交

```bash
git commit -m "feat(web): 添加文章搜索功能"
```

### 带详细描述的提交

```bash
git commit -m "feat(server): 实现 AI 文章摘要功能

- 集成智谱 AI API
- 支持自动生成文章摘要
- 添加摘要长度限制配置
- 实现异步处理机制

Ref: #156"
```

### 修复 Bug

```bash
git commit -m "fix(web): 修复 Markdown 编辑器预览不更新的问题

问题原因：useEffect 依赖项设置错误

Fixes #201"
```

### 文档更新

```bash
git commit -m "docs: 更新 Docker 部署文档

- 添加环境变量配置说明
- 补充常见问题解决方案
- 更新示例配置"
```

## 工具配置

项目使用 Husky 和 lint-staged 进行 Git 提交前检查：

1. **Husky**: Git hooks 管理
2. **lint-staged**: 仅对暂存文件进行检查

### 检查流程

每次提交前会自动执行：
- 代码格式检查（Biome）
- 代码质量检查（Oxlint）
- 类型检查（TypeScript）

### 跳过检查（不推荐）

如需跳过检查（不推荐，除非特殊原因）：

```bash
git commit --no-verify -m "your message"
```

## 参考资料

- [Angular 提交规范](https://github.com/angular/angular/blob/master/CONTRIBUTING.md#commit)
- [Conventional Commits](https://www.conventionalcommits.org/)
- [如何撰写 Git 提交消息](https://chris.beams.io/posts/git-commit/)
