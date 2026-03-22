# 数据库设计

> 状态：设计阶段

## 概述

- **数据库**: PostgreSQL 15+
- **向量扩展**: pgvector
- **ORM**: Prisma

## 核心表结构

### User（用户表）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | String | 主键 |
| email | String | 邮箱（唯一） |
| password | String? | 密码（OAuth 可为空） |
| username | String? | 用户名 |
| isEmailVerified | Boolean | 邮箱是否验证 |
| createdAt | DateTime | 创建时间 |
| updatedAt | DateTime | 更新时间 |

### Article（文章表）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | String | 主键 |
| title | String | 标题 |
| content | Text | 内容（Markdown） |
| status | Enum | 状态：DRAFT/PUBLISHED/ARCHIVED |
| categoryId | String? | 分类 ID |
| createdAt | DateTime | 创建时间 |
| updatedAt | DateTime | 更新时间 |

### Category（分类表）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | String | 主键 |
| name | String | 分类名称 |
| slug | String | URL 标识（唯一） |
| parentId | String? | 父分类 ID（自引用） |

### Tag（标签表）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | String | 主键 |
| name | String | 标签名称 |
| slug | String | URL 标识（唯一） |

### 多对多关联表

| 表名 | 说明 |
|------|------|
| ArticleTag | 文章 - 标签关联 |
| ArticleCategory | 文章 - 分类关联 |

---
**更新**: 2026-01-12
