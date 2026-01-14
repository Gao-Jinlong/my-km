# 前端技术选型规格文档

> 📋 **文档版本**: 1.0.0
>
> **最后更新**: 2026-01-14
>
> **状态**: ✅ 已批准，准备实施

## 📋 概述

本文档定义了 My-KM 个人知识管理系统前端的技术选型、依赖管理和项目架构。基于现代化、高性能和开发体验的原则，选择了业界前沿的技术栈。

---

## 🎯 核心技术栈

### 框架与运行时

| 技术 | 说明 | 官方文档 |
|------|------|----------|
| **Next.js** | 16+ | React 框架，使用 App Router | [nextjs.org](https://nextjs.org/docs) |
| **React** | 19.2.3+ | UI 库，利用最新特性 | [react.dev](https://react.dev) |
| **TypeScript** | 5+ | 类型安全的 JavaScript 超集 | [typescriptlang.org](https://www.typescriptlang.org) |

**选择理由**:
- Next.js 16 提供最新的 App Router、Server Components 和性能优化
- React 19 引入了 use、useOptimistic 等新特性，提升开发体验
- TypeScript 提供完整的类型安全和更好的 IDE 支持

### UI 与样式

| 技术 | 说明 | 官方文档 |
|------|------|----------|
| **Tailwind CSS** | v4 - 使用 PostCSS 集成 | [tailwindcss.com](https://tailwindcss.com/docs) |
| **shadcn/ui** | 基于 Radix UI 的组件系统 | [ui.shadcn.com](https://ui.shadcn.com) |
| **Radix UI** | 无样式、可访问的 UI 原语 | [radix-ui.com](https://www.radix-ui.com/primitives) |
| **Lucide React** | 现代化图标库 | [lucide.dev](https://lucide.dev) |
| **motion** | Framer Motion - 声明式动画库 | [motion.dev](https://motion.dev) |

**选择理由**:
- Tailwind CSS v4 提供更好的性能和开发体验
- shadcn/ui + Radix UI 提供完整的高质量组件和可访问性
- motion 是最流行的 React 动画库，API 简洁强大

### 状态管理

| 技术 | 用途 | 官方文档 |
|------|------|----------|
| **Zustand** | 客户端状态管理 | [zustand-demo.pmnd.rs](https://zustand-demo.pmnd.rs) |
| **TanStack Query** | 服务端状态管理、缓存和同步 | [tanstack.com/query](https://tanstack.com/query/latest) |
| **Zod** | Schema 验证和类型推断 | [zod.dev](https://zod.dev) |

### 数据获取

| 技术 | 说明 | 官方文档 |
|------|------|----------|
| **ky** | 轻量级 HTTP 客户端（fetch 封装） | [ky.sh](https://ky.sh) |

**选择理由**:
- 体积小（3.5KB），API 简洁
- 基于 fetch API，支持 TypeScript 推断
- 内置重试逻辑和请求取消
- 不依赖 XMLHttpRequest（相比 axios）

### 富文本编辑器

| 技术 | 用途 | 官方文档 |
|------|------|----------|
| **Lexical** | Meta 的现代富文本框架 | [lexical.dev](https://lexical.dev/docs) |
| **KaTeX** | 数学公式渲染 | [katex.org](https://katex.org) |
| **Shiki** | 代码语法高亮 | [shiki.style](https://shiki.style) |
| **markdown-it** | Markdown 解析器 | [markdown-it.github.io](https://markdown-it.github.io) |

**选择理由**:
- Lexical 是 Meta 的现代框架，性能优异，可扩展性强
- 内置 Markdown 支持和丰富的插件生态
- 相比 Draft.js 和 Slate，API 更现代，文档更完善
- Shiki 使用 TextMate 语法，支持 VS Code 主题，性能优于 Prism.js

### 工具库

| 技术 | 用途 | 官方文档 |
|------|------|----------|
| **es-toolkit** | 现代 JavaScript 工具库（Lodash 替代） | [es-toolkit.slash.page](https://es-toolkit.slash.page) |
| **dayjs** | 轻量级日期处理库 | [day.js.org](https://day.js.org) |
| **nanoid** | 唯一 ID 生成器 | [github.com/ai/nanoid](https://github.com/ai/nanoid) |
| **clsx** | 条件类名工具 | [github.com/lukeed/clsx](https://github.com/lukeed/clsx) |
| **tailwind-merge** | Tailwind 类名合并 | [github.com/dcastil/tailwind-merge](https://github.com/dcastil/tailwind-merge) |
| **class-variance-authority** | 组件变体管理 | [cva.style](https://cva.style) |

**选择理由**:
- es-toolkit 是 Lodash 的现代替代品，性能更好，体积更小，Tree-shakeable
- dayjs 相比 moment.js 体积小 99%，API 类似
- nanoid 比 UUID 更安全和快速

### UI 增强库

| 技术 | 用途 | 官方文档 |
|------|------|----------|
| **sonner** | 优雅的 Toast 通知 | [emilkowal.ski/ui/sonner](https://emilkowal.ski/ui/sonner) |
| **cmdk** | 命令面板组件 | [cmdk.paco.me](https://cmdk.paco.me) |
| **react-resizable-panels** | 可调整大小的面板布局 | [react-resizable-panels.vercel.app](https://react-resizable-panels.vercel.app) |
| **embla-carousel-react** | 轮播图组件 | [www.embla-carousel.com](https://www.embla-carousel.com) |

### 认证与安全

| 技术 | 用途 | 官方文档 |
|------|------|----------|
| **js-cookie** | Cookie 管理 | [github.com/js-cookie/js-cookie](https://github.com/js-cookie/js-cookie) |

---

## 📦 依赖清单

### 安装命令（Monorepo）

```bash
# apps/web 依赖
pnpm add --filter web lexical @lexical/react zustand @tanstack/react-query ky
pnpm add --filter web @lexical/list @lexical/link @lexical/rich-text @lexical/headless
pnpm add --filter web @lexical/history @lexical/utils @lexical/markdown @lexical/code
pnpm add --filter web @lexical/selection @lexical/table
pnpm add --filter web katex react-katex shiki markdown-it
pnpm add --filter web es-toolkit dayjs nanoid clsx tailwind-merge class-variance-authority
pnpm add --filter web sonner cmdk react-resizable-panels embla-carousel-react motion
pnpm add --filter web zod js-cookie

# apps/web 开发依赖
pnpm add -D --filter web @types/js-cookie @types/katex @types/markdown-it @types/shiki

# packages/ui 依赖
pnpm add --filter ui @radix-ui/react-avatar
pnpm add --filter ui @radix-ui/react-alert-dialog
pnpm add --filter ui @radix-ui/react-collapsible
pnpm add --filter ui @radix-ui/react-dialog
pnpm add --filter ui @radix-ui/react-dropdown-menu
pnpm add --filter ui @radix-ui/react-label
pnpm add --filter ui @radix-ui/react-navigation-menu
pnpm add --filter ui @radix-ui/react-popover
pnpm add --filter ui @radix-ui/react-progress
pnpm add --filter ui @radix-ui/react-scroll-area
pnpm add --filter ui @radix-ui/react-select
pnpm add --filter ui @radix-ui/react-separator
pnpm add --filter ui @radix-ui/react-slider
pnpm add --filter ui @radix-ui/react-slot
pnpm add --filter ui @radix-ui/react-switch
pnpm add --filter ui @radix-ui/react-tabs
pnpm add --filter ui @radix-ui/react-toast
pnpm add --filter ui @radix-ui/react-tooltip
pnpm add --filter ui class-variance-authority clsx tailwind-merge lucide-react
```

---

## 📁 项目结构

```
apps/web/src/
├── app/                    # Next.js App Router
│   ├── (auth)/             # 认证路由
│   ├── (dashboard)/        # 受保护路由
│   ├── layout.tsx          # 根布局
│   └── page.tsx            # 首页
│
├── components/             # React 组件
│   ├── auth/               # 认证组件
│   ├── article/            # 文章组件
│   ├── editor/             # 编辑器组件
│   ├── layout/             # 布局组件
│   └── common/             # 通用组件
│
├── lib/                    # 核心库代码
│   ├── api/                # API 客户端
│   ├── query/              # TanStack Query hooks
│   ├── store/              # Zustand stores
│   ├── hooks/              # 自定义 hooks
│   ├── utils/              # 工具函数
│   └── config/             # 配置文件
│
├── types/                  # TypeScript 类型定义
│
└── middleware.ts           # Next.js 中间件
```

---

## 🏗️ 架构设计原则

### 状态管理策略

- **客户端状态 (Zustand)**: UI 状态、用户认证状态、编辑器状态
- **服务端状态 (TanStack Query)**: 文章、分类、标签等 API 数据
- **本地状态 (useState)**: 组件内部临时状态

### API 客户端架构

使用 **ky** 作为 HTTP 客户端，配合 Zustand 实现：
- 自动添加认证 token
- Token 过期自动刷新
- 统一错误处理
- 请求重试机制

### 路由保护

- **Next.js 中间件**: 路由级别的认证检查
- **ProtectedRoute 组件**: 组件级别的认证保护
- **Token 存储**: Access Token 存储在内存，Refresh Token 存储在 httpOnly Cookie

---

## 🎨 UI 组件库

使用 **shadcn/ui** + **Radix UI** 作为组件基础，通过 shadcn CLI 添加组件，完全可定制。

**相关文档**: [UI 组件库技术规范](./frontend-ui-components.md)

---

## 📖 参考资源

### 官方文档

- [Next.js](https://nextjs.org/docs)
- [React](https://react.dev)
- [Lexical](https://lexical.dev/docs)
- [Zustand](https://zustand-demo.pmnd.rs)
- [TanStack Query](https://tanstack.com/query/latest/docs/react/overview)
- [ky](https://ky.sh/docs)
- [shadcn/ui](https://ui.shadcn.com)
- [Tailwind CSS](https://tailwindcss.com/docs)
- [Radix UI](https://www.radix-ui.com/primitives)

### 工具库文档

- [es-toolkit](https://es-toolkit.slash.page)
- [dayjs](https://day.js.org)
- [Zod](https://zod.dev)
- [motion](https://motion.dev)
- [Shiki](https://shiki.style)
- [KaTeX](https://katex.org)

### 学习资源

- [Next.js Learn](https://nextjs.org/learn)
- [React 19 文档](https://react.dev/learn)
- [TanStack Query 教程](https://tanstack.com/query/latest/docs/react/overview)
- [Lexical 示例](https://lexical.dev/docs/playground)

---

## 📝 附录

### 环境变量

```bash
# .env.local
NEXT_PUBLIC_API_URL=http://localhost:3001/api
NEXT_PUBLIC_APP_URL=http://localhost:4000
```

### TypeScript 配置

```json
// tsconfig.json
{
  "compilerOptions": {
    "strict": true,
    "paths": {
      "@/*": ["./src/*"],
      "@/components/*": ["./src/components/*"],
      "@/lib/*": ["./src/lib/*"],
      "@/types/*": ["./src/types/*"]
    }
  }
}
```

### 相关文档

- [API 设计规范](./api-design.md)
- [数据库设计文档](./database-design.md)
- [认证模块规范](../spec/user-authentication.md)
- [日志规范](./logging-standard.md)
- [Git 提交规范](./git-commit-convention.md)
- [富文本编辑器实现指南](./frontend-editor-implementation.md)
- [认证模块实现指南](./frontend-auth-implementation.md)
- [开发阶段规划](./frontend-roadmap.md)
- [工具库选型对比](./frontend-libraries-comparison.md)

---

**文档版本**: 1.0.0
**最后更新**: 2026-01-14
**维护者**: My-KM 开发团队
