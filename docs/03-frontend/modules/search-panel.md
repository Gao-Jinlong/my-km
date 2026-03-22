# 搜索面板

## 功能简介

搜索面板提供全局搜索功能，支持多种搜索方式和过滤选项。

## 搜索类型

| 类型 | 说明 |
|------|------|
| 全文搜索 | 搜索文件内容 |
| 文件名搜索 | 仅搜索文件名 |
| 标签搜索 | 按标签过滤 |
| 向量检索 | AI 语义搜索 |

## 核心功能

### 搜索方式
- 关键词搜索
- 正则表达式
- 模糊匹配

### 过滤选项
- 文件类型过滤
- 标签过滤
- 日期范围过滤

### 结果展示
- 高亮显示关键词
- 显示匹配位置预览
- 点击跳转到匹配位置

## 数据结构

```typescript
interface SearchPanelState {
  query: string;                 // 搜索关键词
  searchType: 'all' | 'filename' | 'content' | 'tags' | 'vector';
  filters: {
    fileTypes?: string[];
    tags?: string[];
    dateRange?: { start: Date; end: Date };
  };
}
```

---
**更新**: 2026-01-21
