# 项目基础设施 TODO 清单

## 📋 概述

本文档记录项目基础设施相关的待办事项，包括日志、监控、国际化等通用基建功能。

---

## 🔴 高优先级（阻塞开发）

### 1. 日志系统
- [x] 安装和配置日志库（`winston`）
- [x] 创建统一日志服务 (`apps/server/src/logger/`)
- [x] 配置日志级别（development, production）
- [x] 实现请求日志中间件
- [x] 配置日志格式（JSON for production, pretty for dev）
- [x] 集成到 NestJS 全局
- [x] 实现敏感数据脱敏工具
- [x] 添加链路追踪 ID 支持

**文件位置**:
- ✅ `apps/server/src/logger/logger.service.ts` - Logger 服务实现
- ✅ `apps/server/src/logger/logger.module.ts` - Logger 模块
- ✅ `apps/server/src/logger/logger.middleware.ts` - 请求日志中间件
- ✅ `apps/server/src/logger/logger.config.ts` - Logger 配置
- ✅ `apps/server/src/logger/mask.util.ts` - 敏感数据脱敏工具
- ✅ `packages/shared/src/trace.util.ts` - Trace ID 工具（前后端共享）
- [ ] `apps/web/src/lib/logger/index.ts` - 前端日志（待实现）

**规范文档**:
📄 **[日志规范](./logging-standard.md)** - 完整的日志级别、格式、脱敏和最佳实践规范

**参考**:
- [NestJS Logger](https://docs.nestjs.com/techniques/logger)
- [Winston Documentation](https://github.com/winstonjs/winston)

**已完成功能**:
- ✅ Winston 日志库集成（支持文件轮转）
- ✅ 结构化日志（开发环境 pretty print，生产环境 JSON）
- ✅ 敏感数据自动脱敏（邮箱、手机、token、IP 等）
- ✅ 链路追踪 ID 生成和传递
- ✅ HTTP 请求/响应日志中间件
- ✅ 日志级别配置（通过环境变量）
- ✅ 全局异常日志记录

---

### 2. 环境变量管理
- [x] 创建 `.env.example` 文件
- [x] 定义所有必需的环境变量
- [x] 创建环境变量验证 Schema（使用 `class-validator`）
- [x] 创建配置服务（ConfigService）
- [x] 集成到应用模块

**文件位置**:
- ✅ `.env.example` (项目根目录)
- ✅ `apps/server/src/config/dto/env.validation.ts` - 环境变量验证 DTO
- ✅ `apps/server/src/config/env.config.ts` - 配置服务
- ✅ `apps/server/src/config/config.module.ts` - 全局配置模块

**已完成功能**:
- ✅ 使用 class-validator 进行类型安全的环境变量验证
- ✅ 应用启动时自动验证环境变量，失败时清晰提示
- ✅ 便捷的配置访问方法（isDevelopment, isProduction 等）
- ✅ 支持 Database、Logger、AI Provider 等配置
- ✅ 更新了 .env.example 文件，添加完整的配置说明

**必需的环境变量**:
```bash
# ============ Application ============
NODE_ENV=development              # development | production | test
PORT=3001

# ============ Database ============
DATABASE_URL=postgresql://kmuser:kmpass@localhost:5432/km_db

# ============ Logger ============
LOG_LEVEL=info                   # fatal | error | warn | info | debug | trace
LOG_FILE_PATH=./logs
LOG_MAX_SIZE=20m
LOG_MAX_FILES=14d

# ============ AI Provider (Optional) ============
ZHIPUAI_API_KEY=your_api_key_here
AI_PROVIDER=zhipu
```

---

### 3. 统一错误处理
- [x] 创建全局异常过滤器 (`apps/server/src/common/filters/`)
- [x] 定义错误码枚举
- [x] 实现自定义异常类
- [x] 集成日志记录
- [x] 实现错误响应格式
- [ ] 添加前端错误边界组件
- [ ] 创建错误提示 UI 组件

**文件位置**:
- ✅ `apps/server/src/common/constants/error-codes.ts` - 错误码枚举及映射
- ✅ `apps/server/src/common/exceptions/business.exception.ts` - 业务异常基类
- ✅ `apps/server/src/common/exceptions/not-found.exception.ts` - 404 异常
- ✅ `apps/server/src/common/exceptions/bad-request.exception.ts` - 400 异常
- ✅ `apps/server/src/common/filters/all-exceptions.filter.ts` - 全局异常过滤器
- [ ] `apps/web/src/app/error.tsx` - 前端错误页面（待实现）
- [ ] `apps/web/src/components/ui/error-boundary.tsx` - 错误边界组件（待实现）

**已完成功能**:
- ✅ 完整的错误码枚举（参考日志规范中的日志级别）
- ✅ 错误码到 HTTP 状态码的映射
- ✅ 错误码到日志级别的映射（FATAL/ERROR/WARN）
- ✅ 自定义业务异常类（BusinessException）
- ✅ 快捷异常类（NotFoundException, BadRequestException 等）
- ✅ 全局异常过滤器（自动记录日志，返回统一格式）
- ✅ 开发环境显示错误堆栈，生产环境隐藏

---

### 4. API 响应封装
- [x] 创建统一响应 DTO
- [x] 实现成功响应拦截器
- [x] 实现响应时间记录
- [x] 支持跳过封装（用于 SSE 等特殊接口）
- [ ] 实现分页响应封装（已有共享类型，待使用）

**文件位置**:
- ✅ `apps/server/src/common/interceptors/transform.interceptor.ts` - 响应转换拦截器
- ✅ `apps/server/src/common/decorators/skip-response-wrap.decorator.ts` - 跳过封装装饰器
- ✅ `packages/shared/src/types/common.ts` - 共享响应类型定义

**已完成功能**:
- ✅ 全局响应拦截器（自动封装所有接口响应）
- ✅ 统一响应格式：`{ success, data, timestamp, traceId, duration }`
- ✅ 响应时间自动计算和记录
- ✅ Trace ID 自动传递到响应中
- ✅ @SkipResponseWrap() 装饰器（用于 SSE、文件下载等接口）

---

## 🟡 中优先级（提升开发体验）

### 5. API 客户端封装
- [ ] 安装 `ky` HTTP 客户端
- [ ] 创建 `packages/shared/api/` 包
- [ ] 实现 API 基础客户端配置
- [ ] 创建类型化的 API 调用函数
- [ ] 添加请求/响应拦截器
- [ ] 实现自动重试和超时

**文件位置**:
- `packages/shared/api/client.ts`
- `packages/shared/api/types.ts`
- `packages/shared/api/modules/article.ts`
- `packages/shared/api/modules/category.ts`

---

### 6. 类型共享
- [ ] 创建 `packages/shared/types/` 包
- [ ] 定义核心数据类型
- [ ] 定义 API 请求/响应类型
- [ ] 配置 TypeScript 导出
- [ ] 在 web 和 server 中引用

**文件位置**:
- `packages/shared/types/index.ts`
- `packages/shared/types/article.ts`
- `packages/shared/types/category.ts`
- `packages/shared/types/common.ts`

---

### 7. 测试基础设施
- [ ] 配置 Jest（server）
- [ ] 创建测试工具函数
- [ ] 配置测试数据库（使用 Docker）
- [ ] 创建 API 测试模板
- [ ] 配置测试覆盖率报告
- [ ] 添加 E2E 测试框架（Playwright）

**文件位置**:
- `apps/server/test/setup.ts`
- `apps/server/test/utils.ts`
- `apps/web/playwright.config.ts`
- `apps/web/e2e/basic.spec.ts`

---

### 8. Docker 开发环境完善
- [ ] 创建 `apps/server/Dockerfile.dev`
- [ ] 创建 `apps/web/Dockerfile.dev`
- [ ] 测试 docker-compose 配置
- [ ] 添加开发环境启动脚本
- [ ] 配置热重载

**文件位置**:
- `apps/server/Dockerfile.dev`
- `apps/web/Dockerfile.dev`
- `docker-compose.dev.yml`

---

### 9. Git Hooks 配置
- [ ] 配置 Husky 钩子
- [ ] 添加 pre-commit 检查（lint + format）
- [ ] 添加 commit-msg 验证
- [ ] 配置 lint-staged
- [ ] 添加 pre-push 检查（test）

**文件位置**:
- `.husky/pre-commit`
- `.husky/commit-msg`
- `.husky/pre-push`

---

## 🟢 低优先级（长期优化）

### 10. 国际化 (i18n)
- [ ] 评估 i18n 需求
- [ ] 选择 i18n 库（推荐 `next-intl`）
- [ ] 创建翻译文件结构
- [ ] 配置语言切换
- [ ] 实现日期/数字格式化

**文件位置**:
- `apps/web/src/i18n/config.ts`
- `apps/web/src/i18n/locales/en.json`
- `apps/web/src/i18n/locales/zh-CN.json`

---

### 11. 性能监控
- [ ] 集成性能监控工具（Sentry/Vercel Analytics）
- [ ] 配置 Web Vitals 跟踪
- [ ] 添加性能标记
- [ ] 创建性能监控仪表板

**文件位置**:
- `apps/web/src/lib/monitoring.ts`
- `apps/server/src/common/monitoring/sentry.module.ts`

---

### 12. 缓存系统
- [ ] 评估缓存需求（Redis/in-memory）
- [ ] 安装缓存模块（`@nestjs/cache-manager`）
- [ ] 配置缓存 TTL 策略
- [ ] 实现查询结果缓存
- [ ] 实现 HTTP 缓存头

**文件位置**:
- `apps/server/src/cache/cache.module.ts`
- `apps/server/src/cache/cache.service.ts`

---

### 13. 安全加固
- [ ] 安装 `@nestjs/throttler` 限流
- [ ] 配置 Helmet.js 安全头
- [ ] 实现 CORS 策略
- [ ] 添加输入验证和清理
- [ ] 配置 CSP（内容安全策略）

**文件位置**:
- `apps/server/src/common/guards/throttler.guard.ts`
- `apps/server/src/common/helmet/helmet.module.ts`

---

### 14. CI/CD 配置
- [ ] 创建 GitHub Actions 工作流
- [ ] 配置自动化测试
- [ ] 配置自动化构建
- [ ] 配置部署流程

**文件位置**:
- `.github/workflows/ci.yml`
- `.github/workflows/deploy.yml`

---

### 15. 文档生成
- [ ] 配置 API 文档自动生成（Swagger/OpenAPI）
- [ ] 添加组件文档（Storybook）
- [ ] 生成类型文档（TypeDoc）

**文件位置**:
- `apps/server/swagger.config.ts`
- `.storybook/main.ts`

---

## 📊 进度跟踪

| 类别 | 总数 | 已完成 | 进行中 | 待完成 |
|------|------|--------|--------|--------|
| 🔴 高优先级 | 4 | 4 | 0 | 0 |
| 🟡 中优先级 | 6 | 0 | 0 | 6 |
| 🟢 低优先级 | 5 | 0 | 0 | 5 |
| **总计** | **15** | **4** | **0** | **11** |

**最新更新**: 2026-01-12
**完成的高优先级任务**:
- ✅ 1. 日志系统 - Winston 完整实现，包含敏感数据脱敏和链路追踪
- ✅ 2. 环境变量管理 - class-validator 验证，类型安全的 ConfigService
- ✅ 3. 统一错误处理 - 错误码枚举、自定义异常、全局过滤器
- ✅ 4. API 响应封装 - 全局拦截器、响应时间、跳过封装装饰器

---

## 🔗 相关文档

- [技术规格文档](./technical-specification.md)
- [API 设计规范](./api-design.md)
- [日志规范](./logging-standard.md)
- [Git 提交规范](./git-commit-convention.md)

---

**文档版本**: 1.0.0
**创建日期**: 2026-01-12
**最后更新**: 2026-01-12
