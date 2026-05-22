# 前端架构

**技术栈**: Next.js 16 + React 19 + Tailwind CSS 4 + shadcn/ui + Zustand + Lexical

---

## 路由结构 (Next.js App Router)

```
app/
├── [locale]/                     # i18n 前缀 (zh-CN, en)
│   ├── (auth)/                   # 认证路由组
│   │   ├── login/                # 登录
│   │   ├── register/             # 注册
│   │   ├── forgot-password/      # 忘记密码
│   │   ├── reset-password/       # 重置密码
│   │   └── verify-email/         # 验证邮箱
│   ├── workspace/                # 主工作区 (核心页面)
│   └── page.tsx                  # 首页/重定向
```

---

## 分层架构

```
┌─────────────────────────────────────────────┐
│              UI 组件层 (components/)          │
│  auth/  workspace/  form-fields/  ui/        │
├─────────────────────────────────────────────┤
│              Features 层 (features/)         │
│  editor/ (Lexical)    ai/                    │
├─────────────────────────────────────────────┤
│              Platform 层 (platform/)         │
│  DI 容器 + 服务注册 + 生命周期管理             │
├─────────────────────────────────────────────┤
│              基础设施层 (base/)               │
│  Disposable / Emitter / 事件系统             │
└─────────────────────────────────────────────┘
```

---

## 状态管理 (Zustand)

| Store | 文件 | 职责 |
|-------|------|------|
| `useAuthStore` | `stores/auth-store.ts` | JWT token、认证状态 |
| `useWorkspaceStore` | `stores/workspace-store.ts` | 侧边栏、标签页、项目状态 |
| `useThemeStore` | `stores/theme-store.ts` | 主题切换 |
| `useStatusBarStore` | `stores/status-bar-store.ts` | 状态栏 UI 状态 |

---

## 编辑器架构 (Lexical)

```
features/editor/
├── types/           # Block, Document, Selection 类型定义
├── registry/        # BlockRegistry (块类型注册)
├── service/         # EditorService, AutoSaveService
├── store/           # editor-store (编辑器状态)
└── container/       # EditorContainer (平台层桥接)
```

### 块类型注册

BlockRegistry 管理 8 种基础块类型：
- `paragraph` - 文本块
- `heading` - 标题块 (h1-h6)
- `list` - 列表块 (bullet/number/check)
- `quote` - 引用块
- `code` - 代码块
- `table` - 表格块
- `image` - 图片块
- `formula` - 公式块

---

## API 客户端

- 基于 `ky` HTTP 客户端
- 双实例：`apiClient` (带 JWT 自动刷新) / `publicApiClient` (公开端点)
- 自动处理 401 → token 刷新 → 重试
- i18n locale 通过 `X-Locale` header 传递

---

## 相关文件

- [Platform 服务层](./platform/services.md) - DI 容器和服务注册
- [后端 API 设计](../backend/architecture.md) - API 端点文档

---

**最后更新**: 2026-03-30
