# CORS 配置说明

## 问题描述

server 和 web 应用之间存在跨域问题，需要正确配置 CORS 以允许前端应用访问后端 API。

## 解决方案

### Server 配置

后端 CORS 配置位于 [apps/server/src/main.ts](apps/server/src/main.ts:70-91)。

配置特点：

1. **动态 Origin 验证**：使用回调函数精确控制允许的源
2. **支持无 Origin 请求**：允许移动应用、Postman 等工具访问
3. **凭证支持**：启用 `credentials: true`，支持携带 Cookie 和 Authorization 头
4. **明确的 HTTP 方法**：指定允许的 HTTP 方法列表
5. **自定义请求头**：
   - 允许：`Content-Type`、`Authorization`、`X-Locale`
   - 暴露：`Content-Range`、`X-Content-Range`

### 环境变量配置

在 `apps/server/.env` 中配置：

```bash
# CORS (逗号分隔的允许源列表)
ALLOWED_ORIGINS=http://localhost:4000
```

支持多个源（逗号分隔）：

```bash
ALLOWED_ORIGINS=http://localhost:4000,http://localhost:3000,https://example.com
```

## 配置详解

### Origin 验证逻辑

```typescript
origin: (origin: string | undefined, callback: (err: Error | null, allow: boolean) => void) => {
    // 允许没有 origin 的请求（如移动应用、Postman 等）
    if (!origin) {
        return callback(null, true);
    }

    // 检查 origin 是否在允许列表中
    if (allowedOrigins.includes(origin)) {
        callback(null, true);
    } else {
        callback(new Error(`CORS: Origin ${origin} not allowed`), false);
    }
}
```

### 完整配置选项

```typescript
{
    origin: Function,  // 动态验证源
    credentials: true,  // 允许携带凭证
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Locale'],
    exposedHeaders: ['Content-Range', 'X-Content-Range'],
}
```

## 使用说明

### 开发环境

1. 确保 `apps/server/.env` 中设置了正确的 `ALLOWED_ORIGINS`
2. 前端应用默认运行在 `http://localhost:4000`
3. 后端 API 运行在 `http://localhost:3000/api/v1`

### 生产环境

在生产环境配置中，需要：

1. 将实际的前端域名添加到 `ALLOWED_ORIGINS`
2. 确保使用 HTTPS
3. 考虑添加环境特定的配置文件

示例：

```bash
# .env.production
ALLOWED_ORIGINS=https://yourdomain.com,https://www.yourdomain.com
```

## 前端配置

前端 API 客户端配置在 [apps/web/src/api/client.ts](apps/web/src/api/client.ts)。

关键配置：

- API 基础 URL：`NEXT_PUBLIC_API_URL=http://localhost:3000/api/v1`
- 自动处理：认证令牌、刷新令牌、语言设置

## 常见问题

### CORS 错误

如果遇到 CORS 错误，检查：

1. ✅ `ALLOWED_ORIGINS` 是否包含前端 URL
2. ✅ 前端 URL 的协议和端口是否完全匹配
3. ✅ 后端服务器是否正在运行
4. ✅ 是否修改了 `.env` 文件后重启了服务器

### 预检请求 (OPTIONS)

浏览器会自动发送 OPTIONS 预检请求。确保：

1. 服务器正确响应 OPTIONS 请求
2. `allowedHeaders` 包含所有自定义请求头
3. `methods` 包含所有需要使用的 HTTP 方法

### 凭证问题

如果需要携带 Cookie 或 Authorization 头：

1. ✅ `credentials: true` 已设置
2. ✅ 前端请求时设置 `credentials: 'include'`
3. ✅ Origin 不能是 `*`，必须指定具体域名

## 测试

### 使用 curl 测试

```bash
# 测试 CORS 预检请求
curl -X OPTIONS http://localhost:3000/api/v1/auth/login \
  -H "Origin: http://localhost:4000" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: Content-Type,Authorization" \
  -v

# 测试实际请求
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Origin: http://localhost:4000" \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password"}' \
  -v
```

### 使用浏览器测试

1. 打开浏览器开发者工具的 Network 面板
2. 查看请求的 Response Headers
3. 确认存在以下响应头：
   - `Access-Control-Allow-Origin: http://localhost:4000`
   - `Access-Control-Allow-Credentials: true`
   - `Access-Control-Allow-Headers: Content-Type,Authorization,X-Locale`

## 相关文件

- [apps/server/src/main.ts](apps/server/src/main.ts) - CORS 配置
- [apps/server/.env](apps/server/.env) - 环境变量
- [apps/web/src/api/client.ts](apps/web/src/api/client.ts) - 前端 API 客户端
