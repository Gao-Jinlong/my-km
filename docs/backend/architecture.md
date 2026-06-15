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

详细架构文档见 [LLM 对话协议设计 spec](../superpowers/specs/2026-06-15-llm-conversation-protocol-design.md)。

以下为概览。

AI 模块采用三层架构，实现 LLM 与对话完全解耦，支持多 LLM 协作和节点级路由。

```
apps/server/src/ai/
├── ai.module.ts                      # 模块入口
├── ai.controller.ts                  # REST API (房间/消息管理)
├── ai.types.ts                       # 共享类型
├── dto/send-message.dto.ts           # 请求 DTO
├── conversation/                     # Room 管理
│   ├── room.service.ts               #   Room CRUD
│   └── room-state.ts                 #   状态常量
├── dispatch/                         # 请求分发
│   ├── request-dispatcher.ts         #   消息路由 + 速率限制
│   └── rate-limiter.guard.ts
├── langgraph/                        # LangGraph 工作流 (已合并到 ai/ 内)
│   ├── index.ts                      #   模块入口
│   ├── graphs/base-graph.ts          #   图定义接口
│   ├── graphs/chat-graph.ts          #   标准对话工作流
│   ├── nodes/llm-node.ts             #   LLM 调用节点
│   ├── nodes/tool-node.ts            #   工具执行节点
│   ├── nodes/router-node.ts          #   条件路由节点
│   └── types/workflow.types.ts       #   工作流状态定义
├── llm/                              # LLM 抽象层
│   ├── provider.types.ts             #   LLMProvider 接口 + LLMConfig
│   ├── provider-registry.ts          #   Provider 注册表
│   ├── llm-factory.ts                #   按需实例化 + 缓存
│   ├── llm-default-config.ts         #   环境变量默认配置
│   ├── anthropic.provider.ts         #   Anthropic 实现
│   ├── openai.provider.ts            #   OpenAI 实现
│   ├── zhipu.provider.ts             #   智谱 AI 实现
│   └── dashscope.provider.ts         #   DashScope (通义千问)
├── message/                          # 消息服务
│   └── message.service.ts            #   消息持久化 + 历史构建
├── session/                          # 会话管理
│   ├── room-session.ts               #   房间会话
│   ├── room-session.types.ts         #   会话类型
│   └── room-session-registry.ts      #   会话注册表
├── tools/                            # 工具管理
│   ├── tool.dispatcher.ts            #   工具结果分发
│   ├── tool-router.ts                #   工具路由
│   └── tool.types.ts                 #   工具类型
├── workflow/                         # 工作流运行时
│   ├── orchestrator.ts               #   房间编排
│   ├── executor.ts                   #   工作流执行
│   ├── executor.types.ts             #   执行类型
│   ├── graph-registry.ts             #   图注册与查找
│   └── llm-resolver.ts               #   节点级 LLM 解析
└── ws/                               # AI WebSocket 路由
    ├── ai-message-router.ts          #   AI 消息路由
    └── ai-ws-events.types.ts         #   WS 事件类型
```

### 数据流

```
前端 (WS) ──▶ WsGateway / AiMessageRouter
                   │
                   ▼
              RequestDispatcher
              (验证 + 速率限制 + 会话管理)
                   │
                   ▼
              RoomOrchestrator
              (消息持久化 + 历史构建)
                   │
                   ▼
              WorkflowExecutor
              (LangGraph 图执行)
                   │
        ┌──────────┼──────────┐
        ▼          ▼          ▼
   LLMResolver  LLMFactory  SocketRegistry
   (节点路由)   (实例化)     (WS 推送)
        │          │
        ▼          ▼
   LLMProvider (Anthropic/OpenAI/Zhipu/DashScope)
```

### 核心设计

- **LLM 与对话解耦**: LLM 是执行资源，通过 `LLMConfig` 按需实例化
- **节点级路由**: 工作流中每个节点可独立指定 LLM（通过 `llmConfigMap`）
- **默认配置链**: 环境变量驱动默认配置，支持 provider 级 fallback
- **LangGraph 内置**: 图定义在 `apps/server/src/ai/langgraph/` 中，已从独立包合并

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

       │ 1─N         ┌──────────────────┐
       ├────────────→│     Room         │  (AI 对话房间)
       │              │ title, status,   │
       │              │ model, provider  │
       │              └────────┬─────────┘
       │ 1─N                  │ 1─N
       └────────────→┌──────────────────┐
                     │    Message       │  (AI 对话消息)
                     │ role, content,   │
                     │ toolCalls,       │
                     │ tokenCount       │
                     └──────────────────┘
```

- `User` - 核心用户实体，支持 OAuth (password 可空)
- `Account` - OAuth 关联 (GitHub, Google)
- `Session` - JWT refresh token 管理
- `EmailVerification` - 邮箱验证令牌
- `PasswordReset` - 密码重置令牌
- `Room` - AI 对话房间 (title, status, model, provider, messageCount)
- `Message` - AI 对话消息 (role, content, toolCalls, tokenCount, finishReason)

---

## 相关文件

- [前端架构](../frontend/architecture.md) - 前端模块文档
- [AI 前端 runtime](../frontend/langgraph-runtime.md) - SSE/LangGraph SDK 前端链路
- [LLM 对话协议设计](../superpowers/specs/2026-06-15-llm-conversation-protocol-design.md) - Thread/Run/租约/resume 完整协议规范

---

**最后更新**: 2026-05-22
