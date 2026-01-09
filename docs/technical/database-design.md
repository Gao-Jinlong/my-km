# 数据库设计文档

## 📋 概述

本文档描述了个人知识库系统的数据库设计，包括表结构、关系、索引和扩展。

## 🗄️ 数据库选型

- **数据库**: PostgreSQL 15+
- **向量扩展**: pgvector（用于语义搜索）
- **ORM**: Prisma

## 📊 数据库表设计

### 1. Article（文章表）

存储文章的核心内容和元数据。

| 字段 | 类型 | 说明 | 约束 |
|------|------|------|------|
| id | String | 主键 | PRIMARY KEY |
| title | String | 文章标题 | NOT NULL |
| content | Text | 文章内容（Markdown） | NOT NULL |
| summary | Text? | 文章摘要 | NULLABLE |
| coverImage | String? | 封面图片URL | NULLABLE |
| status | ArticleStatus | 文章状态 | DEFAULT DRAFT |
| categoryId | String? | 分类ID（外键） | FOREIGN KEY |
| createdAt | DateTime | 创建时间 | DEFAULT NOW() |
| updatedAt | DateTime | 更新时间 | AUTO UPDATE |
| publishedAt | DateTime? | 发布时间 | NULLABLE |

#### 索引
- `idx_status`: status
- `idx_categoryId`: categoryId
- `idx_createdAt`: createdAt

#### ArticleStatus 枚举
```typescript
enum ArticleStatus {
  DRAFT      // 草稿
  PUBLISHED  // 已发布
  ARCHIVED   // 已归档
}
```

---

### 2. Category（分类表）

支持树形结构的分类系统。

| 字段 | 类型 | 说明 | 约束 |
|------|------|------|------|
| id | String | 主键 | PRIMARY KEY |
| name | String | 分类名称 | NOT NULL |
| slug | String | URL友好的标识 | UNIQUE, NOT NULL |
| parentId | String? | 父分类ID | FOREIGN KEY (自引用) |
| createdAt | DateTime | 创建时间 | DEFAULT NOW() |
| updatedAt | DateTime | 更新时间 | AUTO UPDATE |

#### 关系
- **父子关系**: Category.parentId → Category.id (一对多)
- **文章关系**: Article.categoryId → Category.id (一对多)

#### 索引
- `idx_slug`: slug (UNIQUE)
- `idx_parentId`: parentId

---

### 3. Tag（标签表）

扁平化的标签系统。

| 字段 | 类型 | 说明 | 约束 |
|------|------|------|------|
| id | String | 主键 | PRIMARY KEY |
| name | String | 标签名称 | UNIQUE, NOT NULL |
| slug | String | URL友好的标识 | UNIQUE, NOT NULL |
| color | String? | 标签颜色（十六进制） | NULLABLE |
| createdAt | DateTime | 创建时间 | DEFAULT NOW() |
| updatedAt | DateTime | 更新时间 | AUTO UPDATE |

#### 索引
- `idx_slug`: slug (UNIQUE)

---

### 4. ArticleTag（文章标签关联表）

多对多关系表。

| 字段 | 类型 | 说明 | 约束 |
|------|------|------|------|
| articleId | String | 文章ID | FOREIGN KEY |
| tagId | String | 标签ID | FOREIGN KEY |

#### 复合主键
- PRIMARY KEY (articleId, tagId)

#### 关系
- ArticleTag.articleId → Article.id (多对一)
- ArticleTag.tagId → Tag.id (多对一)

#### 索引
- `idx_articleId`: articleId
- `idx_tagId`: tagId

---

### 5. ChatSession（AI对话会话表）

管理AI对话的会话。

| 字段 | 类型 | 说明 | 约束 |
|------|------|------|------|
| id | String | 主键 | PRIMARY KEY |
| createdAt | DateTime | 创建时间 | DEFAULT NOW() |
| updatedAt | DateTime | 更新时间 | AUTO UPDATE |

#### 关系
- **一对多**: ChatSession.id → ChatMessage.sessionId

---

### 6. ChatMessage（AI对话消息表）

存储对话消息。

| 字段 | 类型 | 说明 | 约束 |
|------|------|------|------|
| id | String | 主键 | PRIMARY KEY |
| sessionId | String | 会话ID | FOREIGN KEY |
| role | ChatRole | 角色（USER/ASSISTANT/SYSTEM） | NOT NULL |
| content | Text | 消息内容 | NOT NULL |
| sources | Json? | 引用的文章片段 | NULLABLE |
| feedback | FeedbackType? | 用户反馈 | NULLABLE |
| createdAt | DateTime | 创建时间 | DEFAULT NOW() |

#### 关系
- ChatMessage.sessionId → ChatSession.id (多对一)

#### 索引
- `idx_sessionId`: sessionId

#### ChatRole 枚举
```typescript
enum ChatRole {
  USER       // 用户消息
  ASSISTANT  // AI回复
  SYSTEM     // 系统消息
}
```

#### FeedbackType 枚举
```typescript
enum FeedbackType {
  POSITIVE  // 有用
  NEGATIVE  // 无用
}
```

---

### 7. SearchHistory（搜索历史表）

记录用户的搜索历史。

| 字段 | 类型 | 说明 | 约束 |
|------|------|------|------|
| id | String | 主键 | PRIMARY KEY |
| query | String | 搜索关键词 | NOT NULL |
| resultsCount | Int | 结果数量 | NOT NULL |
| createdAt | DateTime | 搜索时间 | DEFAULT NOW() |

#### 索引
- `idx_createdAt`: createdAt

---

## 🔍 向量搜索设计（待实施）

使用 pgvector 扩展实现语义搜索。

### Embedding 存储

在 `Article` 表添加向量字段：

```prisma
model Article {
  // ... 其他字段
  embedding Unsupported("vector(1536)")?
}
```

### 向量索引

```sql
CREATE INDEX article_embedding_index
ON Article
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);
```

### 相似度搜索

使用余弦相似度计算文档相似性：

```sql
SELECT
  id,
  title,
  1 - (embedding <=> $1) AS similarity
FROM Article
WHERE embedding IS NOT NULL
ORDER BY embedding <=> $1
LIMIT 10;
```

---

## 📐 关系图

```
┌─────────────┐         ┌──────────────┐
│  Category   │────1:N─→│   Article    │
└─────────────┘         └──────┬───────┘
                               │
                               │ N:N
                               ↓
                        ┌──────────────┐
                        │  ArticleTag  │
                        └──────┬───────┘
                               │
                               │ N:1
                               ↓
                        ┌──────────────┐
                        │     Tag      │
                        └──────────────┘

┌────────────────┐         ┌────────────────┐
│ ChatSession    │────1:N─→│  ChatMessage   │
└────────────────┘         └────────────────┘
```

---

## 🚀 迁移和初始化

### 创建数据库

```bash
# 使用 psql
createdb km_db

# 或使用 Docker
docker-compose up -d postgres
```

### 运行迁移

```bash
cd apps/server
pnpm prisma:generate
pnpm prisma:migrate
```

### 填充示例数据（可选）

```bash
pnpm prisma:seed
```

---

## 📚 参考资料

- [Prisma Schema Reference](https://www.prisma.io/docs/reference/api-reference/prisma-schema-reference)
- [pgvector Documentation](https://github.com/pgvector/pgvector)
- [PostgreSQL Index Types](https://www.postgresql.org/docs/current/indexes-types.html)

---

**文档版本**: 1.0.0
**最后更新**: 2026-01-09
