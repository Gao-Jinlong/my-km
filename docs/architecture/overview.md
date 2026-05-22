# 系统架构概览

**my-km** - AI 原生的个人知识工作室

---

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | Next.js 16 + React 19 + Tailwind CSS 4 + shadcn/ui + Lexical |
| 后端 | NestJS 11 + Prisma ORM |
| 数据库 | PostgreSQL 15 + pgvector |
| 缓存 | Redis (ioredis + cache-manager) |
| 构建 | Turborepo + pnpm workspace |
| 质量工具 | Biome (lint/format) + Jest + Vitest + Playwright |

---

## Monorepo 结构

```
my-km/
├── apps/
│   ├── web/            # Next.js 16 前端 (port 4000)
│   └── server/         # NestJS 11 后端 (port 3000)
├── packages/
│   ├── prisma/         # Prisma schema + 生成客户端
│   └── shared/         # 前后端共享类型、常量、工具函数
├── docs/               # 项目文档
├── skills/             # AI 辅助脚本
└── .claude/            # Claude Code 配置
```

---

## 系统架构总览

```
┌──────────────────────────────────────────────────────────────┐
│                        浏览器                                 │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │                    Next.js 16 (SSR/CSR)                  │ │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐              │ │
│  │  │   Pages   │  │ Features │  │ Platform  │              │ │
│  │  │ (Router)  │  │ (Editor, │  │ (DI +    │              │ │
│  │  │          │  │  AI)     │  │  Services)│              │ │
│  │  └──────────┘  └──────────┘  └──────────┘              │ │
│  │        ↕ zustand         ↕ ky (HTTP) + Socket.io (WS)   │ │
│  └──────────────────────────────┬──────────────────────────┘ │
└─────────────────────────────────┼────────────────────────────┘
                                  │ HTTP (REST + JWT) + WebSocket
┌─────────────────────────────────┼────────────────────────────┐
│                         NestJS 11 │                           │
│  ┌──────────┐  ┌──────────┐  ┌──┴───────┐  ┌──────────┐    │
│  │   Auth   │  │   Users  │  │    AI     │  │   I18n   │    │
│  │ (JWT +   │  │          │  │ (LangGraph│  │          │    │
│  │ Passport)│  │          │  │  + LLM)   │  │          │    │
│  └────┬─────┘  └────┬─────┘  └──────────┘  └──────────┘    │
│       │             │                                          │
│  ┌────┴─────────────┴──────────────────────────────────────┐ │
│  │                   Prisma ORM                             │ │
│  └─────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
                            │
┌───────────────────────────┼──────────────────────────────────┐
│                  PostgreSQL + pgvector                        │
└──────────────────────────────────────────────────────────────┘
```

---

## 共享包 (packages/shared)

前后端共享的类型和工具：

| 文件 | 内容 |
|------|------|
| `types/article.ts` | 文章类型定义 |
| `types/category.ts` | 分类类型定义 |
| `types/tag.ts` | 标签类型定义 |
| `types/common.ts` | 通用类型 |
| `types/i18n.ts` | 国际化类型 |
| `constants/api.ts` | API 常量 |
| `utils/date.ts` | 日期工具函数 |
| `utils/format.ts` | 格式化工具 |
| `trace.util.ts` | 链路追踪工具 |

---

## 模块文档导航

| 模块 | 文档 |
|------|------|
| 系统架构 | [architecture/overview.md](./architecture/overview.md) |
| 前端 | [frontend/architecture.md](./frontend/architecture.md) |
| 前端 Platform | [frontend/platform/services.md](./frontend/platform/services.md) |
| 后端 | [backend/architecture.md](./backend/architecture.md) |
| AI 后端 | [backend/ai-architecture-v2.md](./backend/ai-architecture-v2.md) |
| LLM 对接 | [backend/llm-integration-guide.md](./backend/llm-integration-guide.md) |

---

**最后更新**: 2026-05-22
