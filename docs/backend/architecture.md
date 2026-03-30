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
