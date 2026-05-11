# 后端架构

**技术栈**: NestJS 11 + Prisma ORM + PostgreSQL 15 + pgvector + Redis

---

## 模块结构

```
src/
├── main.ts              # 启动：ValidationPipe, CORS, Swagger, 版本控制
├── app.module.ts        # 根模块，注册所有子模块
├── auth/                # 认证模块
├── users/               # 用户模块
├── cache/               # Redis 缓存模块
├── config/              # 配置模块 (环境变量验证)
├── email/               # 邮件服务 (NestJS mailer)
├── i18n/                # 国际化 (错误消息翻译)
├── logger/              # 日志模块 (Winston)
├── prisma/              # Prisma 数据库服务
└── common/              # 公共层
```

---

## 请求处理管道

```
Request
  → I18nMiddleware (检测 Accept-Language / X-Locale)
  → LoggerMiddleware (记录请求信息)
  → ValidationPipe (DTO 验证 + transform)
  → JwtAuthGuard (如需认证)
  → Controller
  → TransformInterceptor (包装统一响应格式)
  → AllExceptionsFilter (统一异常处理)
Response
```

---

## API 端点

| 前缀 | 模块 | 说明 |
|------|------|------|
| `/api/v1/auth` | Auth | 登录/登出/刷新/邮箱验证/密码重置 |
| `/api/v1/users` | Users | 用户 CRUD / 个人资料 / 密码修改 / 状态管理 |
| `/api-docs` | Swagger | API 文档 |

---

## 全局配置

- **API 前缀**: `/api`，URI 版本控制 (默认 v1)
- **CORS**: 白名单模式，默认允许 `localhost:4000`
- **认证**: JWT (Passport)，`@Public()` 装饰器跳过认证
- **响应格式**: `TransformInterceptor` 统一为 `{ success, data, traceId }`
- **Swagger**: Bearer Auth，`/api-docs`

---

## AI 模块架构（多 LLM + LangGraph）

详细架构文档见 [AI Architecture v2](./ai-architecture-v2.md)。

以下为概览。

AI 模块采用三层架构，实现 LLM 与对话完全解耦，支持多 LLM 协作和节点级路由。

```
apps/server/src/ai/
├── provider/              # LLM 抽象层
│   ├── provider.types.ts  #   LLMProvider 接口 + LLMConfig
│   ├── provider-registry.ts # Provider 注册表
│   ├── llm-factory.ts     #   按需实例化 + 缓存
│   ├── anthropic.provider.ts # Anthropic 实现
│   ├── openai.provider.ts    # OpenAI 实现
│   └── zhipu.provider.ts     # 智谱 AI 实现
├── workflow-runtime/      # 工作流运行时（NestJS 侧）
│   ├── conversation-orchestrator.ts # 对话编排
│   ├── workflow-executor.ts       # 工作流执行
│   ├── llm-resolver.ts            # 节点级 LLM 解析
│   ├── graph-registry.ts          # 图注册与查找
│   └── workflow.types.ts          # 运行时类型
├── dispatch/              # 请求分发
│   ├── request-dispatcher.ts # 消息路由 + 速率限制
│   └── rate-limiter.guard.ts
├── connection/            # 连接管理
│   └── connection-manager.ts
├── session/               # 会话管理
│   └── ai-session-manager.ts
├── message/               # 消息服务
│   └── message.service.ts
├── conversation/          # 对话服务
│   └── conversation.service.ts
├── tools/                 # 工具管理
│   ├── tool.dispatcher.ts
│   └── tool.registry.ts
└── gateway/               # WebSocket 网关
    └── ai-ws.gateway.ts

packages/langgraph-workflows/  # LangGraph 工作流包（纯函数式）
├── src/
│   ├── graphs/
│   │   ├── base-graph.ts   # 图定义接口
│   │   └── chat-graph.ts   # 标准对话工作流
│   ├── nodes/
│   │   ├── llm-node.ts     # LLM 调用节点
│   │   ├── tool-node.ts    # 工具执行节点
│   │   └── router-node.ts  # 条件路由节点
│   └── types/
│       └── workflow.types.ts # 工作流状态定义
```

### 数据流

```
前端 (WS) ──▶ AiGateway
                   │
                   ▼
              RequestDispatcher
              (验证 + 速率限制 + 会话管理)
                   │
                   ▼
              ConversationOrchestrator
              (消息持久化 + 历史构建)
                   │
                   ▼
              WorkflowExecutor
              (LangGraph 图执行)
                   │
        ┌──────────┼──────────┐
        ▼          ▼          ▼
   LLMResolver  LLMFactory  ConnectionManager
   (节点路由)   (实例化)     (WS 推送)
        │          │
        ▼          ▼
   LLMProvider (Anthropic/OpenAI/Zhipu)
```

### 核心设计

- **LLM 与对话解耦**: LLM 是执行资源，通过 `LLMConfig` 按需实例化
- **节点级路由**: 工作流中每个节点可独立指定 LLM（通过 `llmConfigMap`）
- **运行时配置**: 前端可在发送消息时指定 `llmConfigMap` 和 `graphName`
- **LangGraph 隔离**: 图定义在 `packages/langgraph-workflows/` 中，纯函数式无 NestJS 依赖

---

## 数据模型 (Prisma)

```
┌──────────────┐     ┌──────────────┐
│     User     │ 1─N │   Account    │  (OAuth 账号)
│              │────→│              │
│ email        │     └──────────────┘
│ password?    │
│ username?    │     ┌──────────────┐
│ isEmailVerified│ 1─N│   Session    │
│ isActive     │────→│              │
└──────────────┘     │ refreshToken │
       │ 1            └──────────────┘
       │
       │ 1─N         ┌──────────────────┐
       ├────────────→│EmailVerification │
       │              └──────────────────┘
       │ 1─N         ┌──────────────────┐
       └────────────→│  PasswordReset   │
                      └──────────────────┘
```

- `User` - 核心用户实体，支持 OAuth (password 可空)
- `Account` - OAuth 关联 (GitHub, Google)
- `Session` - JWT refresh token 管理
- `EmailVerification` - 邮箱验证令牌
- `PasswordReset` - 密码重置令牌

---

## 相关文件

- [前端架构](../frontend/architecture.md) - 前端模块文档
- [数据库设计](./database.md) - 详细数据库设计

---

**最后更新**: 2026-03-30
