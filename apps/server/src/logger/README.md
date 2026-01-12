# Logger 使用指南

本文档展示如何在服务端代码中使用日志系统。

## 基础使用

### 在 Service 中注入 Logger

```typescript
import { Injectable } from '@nestjs/common';
import { LoggerService } from '../logger/logger.service';

@Injectable()
export class UsersService {
  constructor(private readonly logger: LoggerService) {
    this.logger.setContext('UsersService'); // 设置日志上下文
  }

  async createUser(data: CreateUserDto) {
    this.logger.info('Creating user', { email: data.email });

    try {
      const user = await this.prisma.user.create({ data });
      this.logger.info('User created successfully', { userId: user.id });
      return user;
    } catch (error) {
      this.logger.errorFromException('Failed to create user', error, {
        email: data.email,
      });
      throw error;
    }
  }
}
```

### 在 Controller 中使用 Logger

```typescript
import { Controller, Post, Body } from '@nestjs/common';
import { LoggerService } from '../logger/logger.service';

@Controller('users')
export class UsersController {
  constructor(private readonly logger: LoggerService) {
    this.logger.setContext('UsersController');
  }

  @Post()
  async create(@Body() createUserDto: CreateUserDto) {
    this.logger.debug('Creating user', {
      email: createUserDto.email,
      name: createUserDto.name,
    });

    const user = await this.usersService.create(createUserDto);

    this.logger.info('User created via API', {
      userId: user.id,
      email: user.email,
    });

    return user;
  }
}
```

## 高级用法

### 链路追踪 (Trace ID)

```typescript
import { Request } from 'express';
import { Controller, Post, Body, Req } from '@nestjs/common';
import { LoggerService } from '../logger/logger.service';

@Controller('articles')
export class ArticlesController {
  constructor(private readonly logger: LoggerService) {
    this.logger.setContext('ArticlesController');
  }

  @Post()
  async create(@Body() data: CreateArticleDto, @Req() req: Request) {
    const traceId = req.traceId; // 从中间件获取 Trace ID

    this.logger.logWithTrace('Creating article', traceId, 'info', {
      title: data.title,
      userId: data.userId,
    });

    // 业务逻辑...

    this.logger.logWithTrace('Article created', traceId, 'info', {
      articleId: article.id,
      duration: Date.now() - startTime,
    });
  }
}
```

### 不同日志级别

```typescript
// Fatal - 系统无法继续运行的错误
this.logger.fatal('Database connection lost', { retries: 3 });

// Error - 业务错误
this.logger.error('Invalid credentials', '', {
  email: userInput.email,
  ip: req.ip,
});

// Warn - 潜在问题
this.logger.warn('Cache miss, falling back to database', {
  key: `user:${userId}`,
});

// Info - 关键业务流程
this.logger.info('User logged in', {
  userId: user.id,
  email: user.email,
  ip: req.ip,
});

// Debug - 调试信息（仅开发环境）
this.logger.debug('Processing request', {
  body: requestData,
  headers: req.headers,
});

// Trace - 最详细的执行轨迹
this.logger.trace('Function entry', {
  function: 'processData',
  params: data,
});
```

### 敏感数据自动脱敏

日志系统会自动脱敏敏感字段：

```typescript
// 这些字段会被自动脱敏
this.logger.info('User login attempt', {
  email: 'user@example.com',        // → "us***@example.com"
  password: 'secret123',             // → "***"
  phone: '13800138000',              // → "138****8000"
  token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...', // → "eyJhbGci***1NiJ9..."
  ip: '192.168.1.100',               // → "192.168.*.*"
});
```

### 错误处理

```typescript
try {
  await someOperation();
} catch (error) {
  // 记录完整的错误信息（包括堆栈）
  this.logger.errorFromException('Operation failed', error, {
    userId,
    operation: 'someOperation',
  });
}
```

## 日志格式

### 开发环境

```
2026-01-12 10:30:45 [info] [UsersService] User created successfully {"userId":"123","email":"us***@example.com"}
```

### 生产环境

```json
{
  "level": "info",
  "message": "User created successfully",
  "context": "UsersService",
  "userId": "123",
  "email": "us***@example.com",
  "timestamp": "2026-01-12T10:30:45.123Z",
  "hostname": "server-01"
}
```

## 环境变量配置

在 `.env` 文件中配置：

```bash
# 日志级别: fatal, error, warn, info, debug, trace
LOG_LEVEL=info

# 日志文件路径
LOG_FILE_PATH=./logs

# 单个日志文件最大大小
LOG_MAX_SIZE=20m

# 保留日志文件数量（天）
LOG_MAX_FILES=14d
```

## 最佳实践

1. ✅ **使用结构化日志**（传递对象而不是字符串拼接）
2. ✅ **设置有意义的 context**（类名或模块名）
3. ✅ **选择合适的日志级别**
4. ✅ **包含 Trace ID**（用于追踪请求链路）
5. ✅ **不记录敏感信息**（系统会自动脱敏）
6. ❌ **避免在循环中记录日志**（会产生大量日志）
7. ❌ **避免记录大型对象**（只记录关键字段）
