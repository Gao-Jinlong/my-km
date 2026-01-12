# 日志规范 (Logging Standard)

## 📋 概述

### 目标

本规范旨在为 my-km 项目建立统一的日志记录标准,确保:

- **一致性**: 前后端日志格式统一,便于分析和查询
- **可追溯**: 通过链路追踪 ID 实现分布式请求的全链路追踪
- **安全性**: 敏感信息自动脱敏,保护用户隐私
- **性能**: 日志记录不影响业务性能
- **可维护**: 清晰的日志级别和内容规范

### 适用范围

- **后端**: NestJS 应用 (`apps/server/`)
- **前端**: Next.js 应用 (`apps/web/`)
- **共享包**: 共享类型和工具 (`packages/shared/`)

---

## 🎚️ 日志级别

### 级别定义

| 级别 | 英文 | 描述 | 使用场景 | 生产环境 |
|------|------|------|----------|----------|
| **致命** | `fatal` | 系统无法继续运行的错误 | 数据库连接失败、配置错误等致命问题 | **必须记录** |
| **错误** | `error` | 业务流程中的错误 | API 调用失败、异常抛出、业务逻辑错误 | **必须记录** |
| **警告** | `warn` | 潜在问题或异常情况 | 参数缺失、降级服务、重试操作 | **必须记录** |
| **信息** | `info` | 关键业务流程节点 | 用户登录、订单创建、重要状态变更 | **记录** |
| **调试** | `debug` | 详细的调试信息 | 函数参数、中间变量、详细执行流程 | **不记录** |
| **追踪** | `trace` | 最详细的执行轨迹 | 函数入口/出口、循环详情等 | **不记录** |

### 级别使用原则

```typescript
// ✅ 正确示例
logger.info('User logged in', { userId: '123', ip: '192.168.1.1' });
logger.error('Failed to create article', { error: err.message, userId: '123' });

// ❌ 错误示例
console.log('User logged in'); // 不使用 console.log
logger.debug('User logged in'); // 重要事件不应使用 debug 级别
logger.info(`User ${userId} logged in from ${ip}`); // 应使用结构化字段
```

---

## 📝 日志格式规范

### 后端日志格式 (NestJS)

#### 开发环境 (Development)

**格式**: 带颜色的可读文本

```typescript
{
  timestamp: "2026-01-12 10:30:45",
  level: "info",
  context: "AuthService",
  message: "User logged in successfully",
  userId: "123",
  traceId: "abc123def456",
  duration: 125
}
```

#### 生产环境 (Production)

**格式**: JSON (单行)

```json
{
  "timestamp": "2026-01-12T10:30:45.123Z",
  "level": "info",
  "context": "AuthService",
  "message": "User logged in successfully",
  "userId": "123",
  "traceId": "abc123def456",
  "duration": 125,
  "hostname": "server-01",
  "pid": 12345,
  "environment": "production"
}
```

### 前端日志格式 (Next.js)

#### 浏览器控制台

**格式**: 结构化对象

```typescript
{
  timestamp: "2026-01-12T10:30:45.123Z",
  level: "info",
  context: "ArticleEditor",
  message: "Article saved successfully",
  articleId: "456",
  traceId: "abc123def456",
  userAgent: "Mozilla/5.0...",
  userId: "123"
}
```

#### 上报到服务端 (可选)

**格式**: 与后端一致的 JSON 格式

---

## 🔑 日志字段规范

### 必需字段 (Required)

| 字段名 | 类型 | 说明 | 示例 |
|--------|------|------|------|
| `timestamp` | ISO 8601 | 日志时间戳 | `"2026-01-12T10:30:45.123Z"` |
| `level` | string | 日志级别 | `"info"` |
| `message` | string | 日志消息 | `"User logged in"` |
| `context` | string | 日志上下文(类名/模块名) | `"AuthService"` |
| `traceId` | string | 链路追踪 ID | `"abc123def456"` (用于关联前后端日志) |

### 可选字段 (Optional)

| 字段名 | 类型 | 说明 | 示例 |
|--------|------|------|------|
| `userId` | string | 用户 ID | `"123"` |
| `articleId` | string | 文章 ID | `"456"` |
| `duration` | number | 执行耗时(毫秒) | `125` |
| `error` | string | 错误信息(已脱敏) | `"Invalid credentials"` |
| `stack` | string | 错误堆栈(仅开发环境) | `"Error: ..."` |
| `ip` | string | IP 地址(已脱敏) | `"192.168.*.*"` |
| `userAgent` | string | 用户代理(已脱敏) | `"Mozilla/5.0..."` |
| `hostname` | string | 服务器主机名 | `"server-01"` |
| `pid` | number | 进程 ID | `12345` |
| `environment` | string | 运行环境 | `"production"` |

### 业务场景规范

#### API 请求日志

**后端中间件自动记录**:

```typescript
// 请求进入
logger.info('Incoming request', {
  method: 'POST',
  path: '/api/articles',
  traceId: 'abc123',
  userId: '123',
  ip: '192.168.*.*'
});

// 请求完成
logger.info('Request completed', {
  method: 'POST',
  path: '/api/articles',
  statusCode: 201,
  duration: 125,
  traceId: 'abc123',
  articleId: '456'
});
```

#### 数据库操作日志

```typescript
// Prisma 已配置日志,无需手动记录
// 配置: log: ['query', 'error', 'warn']
```

#### AI 调用日志

```typescript
logger.info('AI chat request', {
  traceId: 'abc123',
  userId: '123',
  model: 'glm-4',
  messageCount: 5,
  duration: 2340
});
```

#### 错误日志

```typescript
// 业务错误
logger.error('Failed to create article', {
  traceId: 'abc123',
  userId: '123',
  error: 'Invalid article data',
  details: { title: 'Missing required field' }
});

// 系统错误
logger.error('Database connection failed', {
  error: err.message,
  stack: err.stack, // 仅开发环境
  retries: 3
});
```

---

## 🔒 敏感信息脱敏规范

### 需要脱敏的字段

#### 1. 用户隐私信息

| 字段 | 脱敏规则 | 示例 |
|------|----------|------|
| `password` | 完全隐藏 | `"***"` |
| `email` | 保留前 2 位和域名 | `"ab***@example.com"` |
| `phone` | 保留前 3 位和后 4 位 | `"138****5678"` |
| `idCard` | 保留前 6 位和后 4 位 | `"11010119900101****"` |

#### 2. 认证信息

| 字段 | 脱敏规则 | 示例 |
|------|----------|------|
| `token` / `jwt` | 仅显示前 8 位和后 4 位 | `"eyJhbG******eyJzdWI"` |
| `apiKey` | 仅显示前 4 位和后 4 位 | `"sk-*******xyz9"` |
| `sessionId` | 完全隐藏或哈希 | `"a3f5c..."` (SHA256 前 8 位) |
| `refreshToken` | 完全隐藏 | `"***"` |

#### 3. 网络信息

| 字段 | 脱敏规则 | 示例 |
|------|----------|------|
| `ip` | IPv4 保留前 2 段,IPv6 保留前 48 位 | `"192.168.*.*"` / `"2001:db8:*:*"` |
| `mac` | 完全隐藏 | `"***"` |

#### 4. 金融信息 (如有)

| 字段 | 脱敏规则 | 示例 |
|------|----------|------|
| `bankAccount` | 保留前 4 位和后 4 位 | `"6222****1234"` |
| `creditCard` | 保留前 6 位和后 4 位 | `"622202******1234"` |

### 脱敏实现

#### 后端实现 (NestJS)

```typescript
// apps/server/src/common/logger/mask.util.ts

export class SensitiveDataMasker {
  private static readonly MASK_PATTERNS = {
    // Email
    email: (value: string) => {
      if (!value || !value.includes('@')) return '***';
      const [local, domain] = value.split('@');
      return `${local.slice(0, 2)}***@${domain}`;
    },

    // Phone (Chinese mobile)
    phone: (value: string) => {
      if (!value || value.length !== 11) return '***';
      return `${value.slice(0, 3)}****${value.slice(-4)}`;
    },

    // Token/JWT
    token: (value: string) => {
      if (!value || value.length < 12) return '***';
      return `${value.slice(0, 8)}***${value.slice(-4)}`;
    },

    // IP Address (IPv4)
    ipv4: (value: string) => {
      if (!value || !value.includes('.')) return '***';
      const parts = value.split('.');
      return `${parts[0]}.${parts[1]}.*.*`;
    },

    // Password (complete mask)
    password: () => '***',
  };

  static mask(fieldName: string, value: any): any {
    if (value === null || value === undefined) return value;

    // Skip masking for non-strings
    if (typeof value !== 'string') return value;

    // Apply specific mask pattern
    const masker = this.MASK_PATTERNS[fieldName as keyof typeof this.MASK_PATTERNS];
    if (masker) {
      return masker(value);
    }

    // Default: mask if field name contains sensitive keywords
    const sensitiveKeywords = ['password', 'secret', 'token', 'key', 'auth'];
    const isSensitive = sensitiveKeywords.some(keyword =>
      fieldName.toLowerCase().includes(keyword)
    );

    if (isSensitive) {
      return value.length > 12 ? `${value.slice(0, 4)}***${value.slice(-4)}` : '***';
    }

    return value;
  }

  static maskObject(obj: Record<string, any>): Record<string, any> {
    const masked: Record<string, any> = {};

    for (const [key, value] of Object.entries(obj)) {
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        masked[key] = this.maskObject(value);
      } else if (Array.isArray(value)) {
        masked[key] = value.map(item =>
          typeof item === 'object' ? this.maskObject(item) : item
        );
      } else {
        masked[key] = this.mask(key, value);
      }
    }

    return masked;
  }
}
```

#### 使用示例

```typescript
// 在 Logger Service 中集成
import { SensitiveDataMasker } from './mask.util';

@Injectable()
export class LoggerService {
  log(message: string, context?: string, meta?: Record<string, any>) {
    const maskedMeta = SensitiveDataMasker.maskObject(meta || {});

    // 记录日志
    this.logger.log(message, maskedMeta);
  }
}

// 使用
this.logger.log('User login attempt', 'AuthService', {
  email: 'user@example.com',
  password: 'secret123',  // 会被自动脱敏
  ip: '192.168.1.100'     // 会被自动脱敏
});

// 输出:
// {
//   message: "User login attempt",
//   context: "AuthService",
//   email: "us***@example.com",
//   password: "***",
//   ip: "192.168.*.*"
// }
```

#### 前端实现 (Next.js)

```typescript
// apps/web/src/lib/logger/mask.util.ts

export const maskSensitiveData = (
  data: Record<string, any>
): Record<string, any> => {
  // 与后端保持一致的脱敏逻辑
  const masked = { ...data };

  // 脱敏 token
  if (masked.token) {
    masked.token = masked.token.length > 12
      ? `${masked.token.slice(0, 8)}***${masked.token.slice(-4)}`
      : '***';
  }

  // 脱敏邮箱
  if (masked.email) {
    const [local, domain] = masked.email.split('@');
    masked.email = `${local.slice(0, 2)}***@${domain}`;
  }

  return masked;
};
```

---

## ✅ 日志记录最佳实践

### 何时记录日志

#### ✅ 应该记录

1. **所有错误和异常**
   ```typescript
   try {
     await createArticle(data);
   } catch (error) {
     logger.error('Failed to create article', {
       error: error.message,
       userId,
       traceId
     });
   }
   ```

2. **关键业务流程**
   ```typescript
   logger.info('User registered', { userId, email, traceId });
   logger.info('Article published', { articleId, userId, traceId });
   ```

3. **外部 API 调用**
   ```typescript
   logger.info('AI model invocation', {
     model: 'glm-4',
     duration,
     traceId
   });
   ```

4. **性能关键点**
   ```typescript
   const start = Date.now();
   await heavyOperation();
   logger.debug('Heavy operation completed', {
     duration: Date.now() - start,
     traceId
   });
   ```

#### ❌ 不应该记录

1. **敏感信息** (必须脱敏)
2. **大量循环数据** (会导致日志爆炸)
3. **二进制数据** (图片、文件等)
4. **开发环境调试信息** (生产环境)

### 如何记录有效的日志

#### 1. 使用结构化日志

```typescript
// ✅ 正确
logger.info('Article created', {
  articleId: '123',
  title: 'Introduction to Logging',
  category: 'Technology',
  userId: '456'
});

// ❌ 错误
logger.info('Article created with id 123 and title Introduction to Logging by user 456');
```

#### 2. 包含上下文信息

```typescript
// ✅ 正确
logger.error('Failed to fetch article', {
  articleId: '123',
  userId: '456',
  error: 'Article not found',
  traceId: 'abc123'
});

// ❌ 错误
logger.error('Failed to fetch article');
```

#### 3. 使用适当的日志级别

```typescript
// ✅ 正确
logger.fatal('Database connection failed'); // 系统无法运行
logger.error('User authentication failed'); // 业务错误
logger.warn('Cache miss, falling back to DB'); // 潜在问题
logger.info('User logged in'); // 正常业务流程
logger.debug('Function parameter value'); // 调试信息

// ❌ 错误
logger.info('Database connection failed'); // 应该用 fatal
logger.debug('User logged in'); // 应该用 info
```

### 避免的反模式

#### ❌ 在循环中记录日志

```typescript
// 反模式: 会产生大量日志
for (const item of items) {
  logger.info('Processing item', { itemId: item.id });
}
```

**改进**:
```typescript
logger.info('Processing batch', { itemCount: items.length });
for (const item of items) {
  // 处理逻辑
}
logger.info('Batch completed', { successCount: items.length });
```

#### ❌ 记录大量对象

```typescript
// 反模式: 记录整个请求体
logger.info('Request received', { body: requestBody });
```

**改进**:
```typescript
logger.info('Request received', {
  endpoint: '/api/articles',
  articleCount: requestBody.articles.length,
  userId: requestBody.userId
});
```

#### ❌ 使用 console.log

```typescript
// 反模式
console.log('User logged in');
console.error('Error occurred', error);
```

**改进**:
```typescript
logger.info('User logged in', { userId });
logger.error('Error occurred', { error: error.message });
```

---

## ⚡ 性能考虑

### 日志级别控制

```typescript
// 开发环境
const logLevel = 'debug';

// 生产环境
const logLevel = 'info'; // 不记录 debug 和 trace
```

### 异步日志写入

```typescript
// 使用异步日志传输器 (winston/Pino)
import * as winston from 'winston';

const logger = winston.createLogger({
  transports: [
    new winston.transports.File({
      filename: 'combined.log',
      format: winston.format.json()
    })
  ]
});
```

### 日志采样 (高频日志)

```typescript
// 对高频日志进行采样
let counter = 0;
function logWithSampling(message: string, meta: any) {
  counter++;
  if (counter % 100 === 0) {
    logger.warn(message, { ...meta, sampleCount: counter });
  }
}
```

### 日志缓冲 (前端)

```typescript
// 前端批量上报日志
class BufferedLogger {
  private buffer: LogEntry[] = [];
  private readonly FLUSH_INTERVAL = 5000; // 5 秒
  private readonly BUFFER_SIZE = 50; // 50 条

  async flush() {
    if (this.buffer.length === 0) return;

    await fetch('/api/logs', {
      method: 'POST',
      body: JSON.stringify(this.buffer)
    });

    this.buffer = [];
  }
}
```

---

## 📊 实施检查清单

### 后端 (NestJS)

- [ ] 安装日志库 (`winston` 或 `@nestjs/logger`)
- [ ] 创建 Logger Service (`apps/server/src/common/logger/logger.service.ts`)
- [ ] 创建 Logger Module (`apps/server/src/common/logger/logger.module.ts`)
- [ ] 实现日志中间件 (`apps/server/src/common/logger/logger.middleware.ts`)
- [ ] 配置开发环境格式 (pretty print)
- [ ] 配置生产环境格式 (JSON)
- [ ] 实现敏感数据脱敏工具 (`mask.util.ts`)
- [ ] 在全局异常过滤器中集成日志
- [ ] 添加请求日志中间件
- [ ] 配置日志级别 (环境变量控制)
- [ ] 添加链路追踪 ID 生成和传递

### 前端 (Next.js)

- [ ] 创建 Logger 工具 (`apps/web/src/lib/logger/index.ts`)
- [ ] 实现日志缓冲和批量上报
- [ ] 集成错误边界 (Error Boundary)
- [ ] 实现敏感数据脱敏
- [ ] 添加用户行为日志 (可选)
- [ ] 配置开发/生产环境日志级别

### 测试

- [ ] 单元测试: 脱敏函数
- [ ] 单元测试: 日志格式验证
- [ ] 集成测试: 请求日志链路追踪
- [ ] 性能测试: 日志对系统性能的影响

### 文档

- [ ] 在 `README.md` 中引用本文档
- [ ] 更新 `infrastructure-todo.md` 日志部分状态
- [ ] 添加日志查询和分析最佳实践 (后续)

---

## �� 附录

### A. 推荐日志库

#### 后端

| 库 | 特点 | 推荐度 |
|----|------|--------|
| [Winston](https://github.com/winstonjs/winston) | 功能丰富,可扩展性强 | ⭐⭐⭐⭐⭐ |
| [Pino](https://getpino.io/) | 极高性能,异步优先 | ⭐⭐⭐⭐ |
| [@nestjs/logger](https://docs.nestjs.com/techniques/logger) | NestJS 官方,简单易用 | ⭐⭐⭐ |

**推荐**: Winston (功能丰富,社区活跃,文档完善)

#### 前端

| 库 | 特点 | 推荐度 |
|----|------|--------|
| [loglevel](https://github.com/pimterry/loglevel) | 轻量级,级别控制 | ⭐⭐⭐⭐⭐ |
| [Pino](https://getpino.io/) | 与后端统一 | ⭐⭐⭐⭐ |

**推荐**: loglevel (前端专用,体积小)

### B. 链路追踪实现

#### Trace ID 生成

```typescript
// packages/shared/utils/trace.util.ts

export function generateTraceId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// 示例: "1705024645123-abc123xyz"
```

#### 前后端传递

```typescript
// 前端: 在请求头中传递
const traceId = generateTraceId();
fetch('/api/articles', {
  headers: {
    'X-Trace-Id': traceId
  }
});

// 后端: 中间件提取并使用
@Injectable()
export class TraceMiddleware implements NestMiddleware {
  use(req: any, res: any, next: () => void) {
    req.traceId = req.headers['x-trace-id'] || generateTraceId();
    next();
  }
}
```

### C. 日志配置示例

#### 环境变量 (.env.example)

```bash
# 日志配置
LOG_LEVEL=info              # 日志级别: fatal, error, warn, info, debug, trace
LOG_FORMAT=json             # 日志格式: json, pretty (开发环境)
LOG_FILE_PATH=./logs        # 日志文件路径
LOG_MAX_SIZE=20m            # 单个日志文件最大大小
LOG_MAX_FILES=14            # 保留日志文件数量 (天)
```

#### Winston 配置

```typescript
// apps/server/src/common/logger/logger.config.ts

import * as winston from 'winston';
import 'winston-daily-rotate-file';

export const loggerConfig = {
  level: process.env.LOG_LEVEL || 'info',
  format: process.env.NODE_ENV === 'production'
    ? winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      )
    : winston.format.combine(
        winston.format.colorize(),
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        winston.format.printf(({ timestamp, level, context, message, ...meta }) => {
          return `${timestamp} [${level}] [${context || 'Application'}] ${message} ${
            Object.keys(meta).length ? JSON.stringify(meta, null, 2) : ''
          }`;
        })
      ),
  transports: [
    new winston.transports.DailyRotateFile({
      filename: 'logs/application-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      maxSize: process.env.LOG_MAX_SIZE || '20m',
      maxFiles: process.env.LOG_MAX_FILES || '14d'
    }),
    new winston.transports.Console()
  ]
};
```

### D. 相关资源

- [NestJS Logger 文档](https://docs.nestjs.com/techniques/logger)
- [Winston 文档](https://github.com/winstonjs/winston)
- [Pino 文档](https://getpino.io/)
- [十二因素应用 - 日志](https://12factor.net/zh_cn/logs)

---

## 📝 版本历史

| 版本 | 日期 | 变更内容 | 作者 |
|------|------|----------|------|
| 1.0.0 | 2026-01-12 | 初始版本,定义全栈日志规范 | Claude |

---

**文档状态**: ✅ 已定义,待实施
**下一步**: 根据 `infrastructure-todo.md` 中的日志系统 TODO 项进行实施
