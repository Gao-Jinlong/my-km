# API 设计规范

> ⚠️ **重要提示**: 本文档是 API 设计规范，当前处于**设计阶段**。
> 实际 API 端点尚未实现，Swagger 文档仅包含基础框架。
>
> 实际可用的 API 请访问: `http://localhost:3001/api`

## 📋 概述

本文档定义了个人知识库系统的 RESTful API 设计规范，包括端点定义、数据格式、错误处理等。

## 🔌 基础规范

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

### 统一响应格式

#### 成功响应

```typescript
interface ApiResponse<T> {
  success: true
  data: T
  message?: string
}
```

**示例**:
```json
{
  "success": true,
  "data": {
    "id": "clx123",
    "title": "我的文章"
  },
  "message": "操作成功"
}
```

#### 错误响应

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

**示例**:
```json
{
  "success": false,
  "error": {
    "code": "ARTICLE_NOT_FOUND",
    "message": "文章不存在",
    "details": {
      "articleId": "clx123"
    }
  }
}
```

#### 分页响应

```typescript
interface PaginatedResponse<T> {
  success: true
  data: {
    items: T[]
    pagination: {
      page: number
      pageSize: number
      total: number
      totalPages: number
    }
  }
}
```

**示例**:
```json
{
  "success": true,
  "data": {
    "items": [...],
    "pagination": {
      "page": 1,
      "pageSize": 20,
      "total": 100,
      "totalPages": 5
    }
  }
}
```

---

## 📚 API 端点

### 1. 文章管理 API

#### 创建文章

```
POST /api/articles
```

**请求体**:
```json
{
  "title": "文章标题",
  "content": "文章内容（Markdown）",
  "summary": "文章摘要",
  "coverImage": "https://example.com/image.jpg",
  "status": "DRAFT",
  "categoryId": "clx456",
  "tagIds": ["clx789", "clx101"]
}
```

**响应**: `201 Created`
```json
{
  "success": true,
  "data": {
    "id": "clx123",
    "title": "文章标题",
    "content": "文章内容",
    "status": "DRAFT",
    "createdAt": "2026-01-09T10:00:00Z"
  }
}
```

#### 获取文章列表

```
GET /api/articles?page=1&pageSize=20&status=PUBLISHED&categoryId=clx456
```

**查询参数**:
- `page`: 页码（默认: 1）
- `pageSize`: 每页数量（默认: 20，最大: 100）
- `status`: 文章状态（DRAFT/PUBLISHED/ARCHIVED）
- `categoryId`: 分类ID
- `tagId`: 标签ID
- `search`: 搜索关键词

**响应**: `200 OK`

#### 获取文章详情

```
GET /api/articles/:id
```

**响应**: `200 OK`

#### 更新文章

```
PATCH /api/articles/:id
```

**请求体**:
```json
{
  "title": "新标题",
  "content": "新内容"
}
```

**响应**: `200 OK`

#### 删除文章

```
DELETE /api/articles/:id
```

**响应**: `204 No Content`

---

### 2. 分类管理 API

#### 获取分类列表（树形）

```
GET /api/categories
```

**响应**: `200 OK`
```json
{
  "success": true,
  "data": [
    {
      "id": "clx456",
      "name": "技术",
      "slug": "tech",
      "parentId": null,
      "children": [
        {
          "id": "clx457",
          "name": "前端",
          "slug": "frontend",
          "parentId": "clx456",
          "children": []
        }
      ]
    }
  ]
}
```

#### 创建分类

```
POST /api/categories
```

**请求体**:
```json
{
  "name": "分类名称",
  "slug": "category-slug",
  "parentId": "clx456"
}
```

**响应**: `201 Created`

#### 更新分类

```
PATCH /api/categories/:id
```

**响应**: `200 OK`

#### 删除分类

```
DELETE /api/categories/:id
```

**响应**: `204 No Content`

---

### 3. 标签管理 API

#### 获取标签列表

```
GET /api/tags?search=关键词
```

**响应**: `200 OK`

#### 创建标签

```
POST /api/tags
```

**请求体**:
```json
{
  "name": "标签名称",
  "slug": "tag-slug",
  "color": "#3B82F6"
}
```

**响应**: `201 Created`

#### 更新标签

```
PATCH /api/tags/:id
```

**响应**: `200 OK`

#### 删除标签

```
DELETE /api/tags/:id
```

**响应**: `204 No Content`

---

### 4. 搜索 API

#### 搜索文章

```
GET /api/search?q=搜索关键词&limit=10&mode=hybrid
```

**查询参数**:
- `q`: 搜索关键词（必需）
- `limit`: 返回结果数量（默认: 10）
- `mode`: 搜索模式
  - `keyword`: 关键词搜索
  - `semantic`: 语义搜索
  - `hybrid`: 混合搜索（默认）

**响应**: `200 OK`
```json
{
  "success": true,
  "data": {
    "results": [
      {
        "article": {
          "id": "clx123",
          "title": "相关文章",
          "summary": "文章摘要"
        },
        "score": 0.95,
        "highlights": ["搜索关键词"]
      }
    ],
    "total": 50
  }
}
```

#### 搜索建议

```
GET /api/search/suggestions?q=搜
```

**响应**: `200 OK`
```json
{
  "success": true,
  "data": {
    "suggestions": ["搜索关键词1", "搜索关键词2"]
  }
}
```

#### 搜索历史

```
GET /api/search/history?limit=10
```

**响应**: `200 OK`

---

### 5. AI 问答 API

#### 发送问题

```
POST /api/ai/chat
```

**请求体**:
```json
{
  "message": "用户问题",
  "sessionId": "clx789",
  "stream": false
}
```

**响应**: `200 OK`
```json
{
  "success": true,
  "data": {
    "messageId": "clx999",
    "content": "AI 回答",
    "sources": [
      {
        "articleId": "clx123",
        "title": "引用的文章",
        "snippet": "相关内容片段"
      }
    ]
  }
}
```

**流式响应** (`stream: true`):
```
Content-Type: text/event-stream

data: {"token": "我"}
data: {"token": "是"}
data: {"token": "AI"}
...
data: {"done": true}
```

#### 获取对话历史

```
GET /api/ai/chat/history?sessionId=clx789
```

**响应**: `200 OK`

#### 清除对话历史

```
DELETE /api/ai/chat/history?sessionId=clx789
```

**响应**: `204 No Content`

---

### 6. AI 辅助编辑 API

#### 润色内容

```
POST /api/ai/edit/polish
```

**请求体**:
```json
{
  "content": "原始内容",
  "style": "professional"
}
```

**响应**: `200 OK`
```json
{
  "success": true,
  "data": {
    "polished": "润色后的内容",
    "changes": ["改进了措辞", "优化了结构"]
  }
}
```

#### 生成摘要

```
POST /api/ai/edit/summarize
```

**请求体**:
```json
{
  "content": "长文章内容...",
  "maxLength": 200
}
```

**响应**: `200 OK`

#### 扩写内容

```
POST /api/ai/edit/expand
```

**请求体**:
```json
{
  "content": "简短内容",
  "targetLength": 1000
}
```

**响应**: `200 OK`

#### 提取关键词

```
POST /api/ai/edit/keywords
```

**请求体**:
```json
{
  "content": "文章内容...",
  "limit": 10
}
```

**响应**: `200 OK`
```json
{
  "success": true,
  "data": {
    "keywords": ["关键词1", "关键词2", "关键词3"]
  }
}
```

---

## ⚠️ 错误处理

### HTTP 状态码

| 状态码 | 说明 |
|--------|------|
| 200 OK | 请求成功 |
| 201 Created | 资源创建成功 |
| 204 No Content | 删除成功 |
| 400 Bad Request | 请求参数错误 |
| 401 Unauthorized | 未认证 |
| 403 Forbidden | 无权限 |
| 404 Not Found | 资源不存在 |
| 422 Unprocessable Entity | 验证失败 |
| 429 Too Many Requests | 请求过于频繁 |
| 500 Internal Server Error | 服务器错误 |

### 错误码列表

```typescript
const API_ERROR_CODES = {
  // 文章相关
  ARTICLE_NOT_FOUND: 'ARTICLE_NOT_FOUND',
  ARTICLE_ALREADY_EXISTS: 'ARTICLE_ALREADY_EXISTS',

  // 分类相关
  CATEGORY_NOT_FOUND: 'CATEGORY_NOT_FOUND',
  CATEGORY_HAS_CHILDREN: 'CATEGORY_HAS_CHILDREN',

  // 标签相关
  TAG_NOT_FOUND: 'TAG_NOT_FOUND',
  TAG_ALREADY_EXISTS: 'TAG_ALREADY_EXISTS',

  // 验证相关
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  INVALID_INPUT: 'INVALID_INPUT',

  // AI 相关
  AI_SERVICE_ERROR: 'AI_SERVICE_ERROR',
  AI_QUOTA_EXCEEDED: 'AI_QUOTA_EXCEEDED',
  EMBEDDING_ERROR: 'EMBEDDING_ERROR',

  // 通用错误
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
} as const
```

---

## 🔐 认证与授权（待实施）

当前版本为个人使用，不需要认证。

未来版本将支持：
- JWT Token 认证
- API Key 认证
- OAuth 2.0（可选）

---

## 📝 请求示例

### 使用 Axios

```typescript
import axios from 'axios'

const api = axios.create({
  baseURL: 'http://localhost:3001/api',
})

// 获取文章列表
const response = await api.get('/articles', {
  params: {
    page: 1,
    pageSize: 20,
  },
})

// 创建文章
const newArticle = await api.post('/articles', {
  title: '新文章',
  content: '内容',
  status: 'DRAFT',
})
```

### 使用 Fetch

```typescript
// 获取文章列表
const response = await fetch('http://localhost:3001/api/articles?page=1')
const data = await response.json()

// 创建文章
const response = await fetch('http://localhost:3001/api/articles', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    title: '新文章',
    content: '内容',
  }),
})
```

---

## 📚 参考资料

- [REST API 设计规范](https://restfulapi.net/)
- [HTTP 方法指南](https://developer.mozilla.org/en-US/docs/Web/HTTP/Methods)
- [JSON API 规范](https://jsonapi.org/)

---

**文档版本**: 0.2.0（设计阶段）
**最后更新**: 2026-01-12
