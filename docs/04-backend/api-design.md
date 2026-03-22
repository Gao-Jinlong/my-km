# API 设计规范

> 状态：设计阶段

## 基础规范

### 基础路径

```
http://localhost:3001/api
```

### HTTP 方法

| 方法 | 用途 | 示例 |
|------|------|------|
| GET | 获取资源 | GET /api/articles |
| POST | 创建资源 | POST /api/articles |
| PATCH | 更新资源（部分） | PATCH /api/articles/:id |
| PUT | 更新资源（完整） | PUT /api/articles/:id |
| DELETE | 删除资源 | DELETE /api/articles/:id |

## 统一响应格式

### 成功响应

```typescript
interface ApiResponse<T> {
  success: true
  data: T
  message?: string
}
```

### 错误响应

```typescript
interface ErrorResponse {
  success: false
  error: {
    code: string
    message: string
    details?: any
  }
}
```

## 错误码规范

| 错误码 | 说明 |
|--------|------|
| `NOT_FOUND` | 资源不存在 |
| `UNAUTHORIZED` | 未授权 |
| `FORBIDDEN` | 禁止访问 |
| `BAD_REQUEST` | 请求参数错误 |
| `INTERNAL_ERROR` | 服务器内部错误 |

---
**更新**: 2026-01-12
