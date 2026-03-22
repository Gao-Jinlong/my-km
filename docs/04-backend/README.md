# 后端技术文档索引

> NestJS 11 + Prisma + PostgreSQL + pgvector

## 📚 文档目录

### 核心技术

| 文档 | 说明 | 状态 |
|------|------|------|
| [技术规格](./technical-specification.md) | 后端技术栈和架构 | ✅ 完成 |
| [API 设计规范](./api-design.md) | RESTful API 设计指南 | ✅ 完成 |

### 数据库

| 文档 | 说明 | 状态 |
|------|------|------|
| [数据库设计](./database-design.md) | 表结构、关系、索引 | ✅ 完成 |
| [缓存设计](./cache-design.md) | Redis 缓存策略 | ✅ 完成 |

### 模块文档

| 文档 | 说明 | 状态 |
|------|------|------|
| [认证模块](./modules/auth.md) | JWT 认证、OAuth | 📝 待编写 |
| [用户模块](./modules/users.md) | 用户管理 | 📝 待编写 |
| [邮件模块](./modules/email.md) | 邮件发送 | 📝 待编写 |
| [日志模块](./modules/logger.md) | Winston 日志配置 | 📝 待编写 |

### 基础设施

| 文档 | 说明 | 状态 |
|------|------|------|
| [日志规范](./logging-standard.md) | 日志级别、格式、输出 | ✅ 完成 |
| [CORS 配置](./cors-configuration.md) | 跨域资源配置 | ✅ 完成 |

---

## 🛠️ 技术栈

| 类别 | 技术 | 说明 |
|------|------|------|
| **框架** | NestJS 11 | 模块化 Node.js 框架 |
| **ORM** | Prisma | 类型安全的数据库访问 |
| **数据库** | PostgreSQL 15 + pgvector | 关系型数据库 + 向量扩展 |
| **缓存** | Redis + cache-manager | 分布式缓存 |
| **认证** | JWT + Passport | Token 认证 |
| **邮件** | @nestjs-modules/mailer | 邮件发送 |
| **日志** | Winston | 高性能日志库 |
| **验证** | class-validator | 装饰器验证 |
| **文档** | Swagger | API 文档生成 |

---

## 🚀 快速开始

```bash
# 启动数据库
docker-compose up -d postgres redis

# 运行迁移
cd apps/server
pnpm prisma:generate
pnpm prisma:migrate

# 启动开发服务器
pnpm dev:server
```

---

## 📊 核心数据库表

- **User** - 用户账户
- **Account** - OAuth 账户关联
- **Session** - 用户会话
- **EmailVerification** - 邮箱验证
- **PasswordReset** - 密码重置

---

## 🔗 相关文档

- [产品文档](../01-product/README.md) - 产品规格
- [架构文档](../02-architecture/README.md) - 系统设计
- [前端文档](../03-frontend/README.md) - 前端实现
- [基础设施](../05-infrastructure/README.md) - 开发规范

---

**文档版本**: 1.0.0
**最后更新**: 2026-03-22
