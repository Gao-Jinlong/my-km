# Shared Package

这是项目的共享包，包含类型定义、常量和工具函数。

## 内容

### 类型定义 (types/)

- `article.ts` - 文章相关类型
- `category.ts` - 分类相关类型
- `tag.ts` - 标签相关类型
- `common.ts` - 通用类型

### 常量 (constants/)

- `api.ts` - API 相关常量

### 工具函数 (utils/)

- `date.ts` - 日期格式化函数
- `format.ts` - 文本格式化函数

## 使用

```typescript
import { Article, ArticleStatus } from 'shared'
import { formatDate } from 'shared'

const article: Article = {
  id: '1',
  title: '我的文章',
  content: '文章内容',
  status: ArticleStatus.PUBLISHED,
  // ...
}

const dateStr = formatDate(new Date())
```
