# 搜索面板

## 📋 文档信息

- **所属模块**: Sidebar
- **子模块**: Search Panel (搜索面板)
- **版本**: 2.0.0
- **创建日期**: 2026-01-20
- **最后更新**: 2026-01-21
- **状态**: ✅ 需求定义完成

---

## 🎯 模块概述

搜索面板提供强大的全局搜索功能,支持多种搜索方式,帮助用户快速定位项目中的文件和内容。

### 核心价值

1. **多种搜索方式**: 全局文本、文件名、标签、元数据、向量检索
2. **智能搜索**: 实时搜索建议,搜索历史
3. **结果高亮**: 清晰显示匹配内容
4. **快速导航**: 一键跳转到搜索结果

### 界面布局

```
┌─────────────────────────────────┐
│ [Files] [Search] [+]           │ ← Tab 切换栏
├─────────────────────────────────┤
│ 🔍 搜索文件...                  │ ← 搜索输入框
├─────────────────────────────────┤
│ [全部] [文件名] [内容] [标签]   │ ← 搜索类型切换
├─────────────────────────────────┤
│ 📄 搜索结果 (23)               │
│                                 │
│ ├─ 📄 README.md                │
│ │  └─ My-KM 是一个...           │ ← 结果预览
│ ├─ 📄 App.tsx                  │
│ │  └─ export default function... │
│ └─ 📁 docs/                     │
│     └─ 📄 guide.md              │
│                                 │
│ ← 可滚动区域                    │
├─────────────────────────────────┤
│  [⚙️]  [👤]                    │ ← 底部操作区
└─────────────────────────────────┘
```

---

## 📖 功能需求

### WV-LS-SP-FR-1: 搜索输入框

**优先级**: MUST

**描述**:
提供实时搜索输入框,支持输入关键词进行搜索,显示搜索建议和历史记录。

**功能详情**:

1. **实时搜索**
   - 输入关键词后 300ms 触发搜索
   - 显示搜索加载状态
   - 支持取消搜索 (Esc 键)

2. **搜索建议**
   - 显示历史搜索记录
   - 显示热门搜索关键词
   - 支持键盘导航建议

3. **快捷操作**
   - Cmd/Ctrl + F 聚焦搜索框
   - Enter 执行搜索
   - Esc 清空搜索

4. **输入验证**
   - 空搜索提示
   - 特殊字符处理
   - 最小搜索长度提示

**验收标准**:
- [ ] 顶部显示搜索输入框
- [ ] 输入关键词后 300ms 触发搜索
- [ ] 显示搜索加载状态
- [ ] 显示搜索历史和建议
- [ ] 支持快捷键操作

**实施状态**: ⏳ 待实现

---

### WV-LS-SP-FR-2: 搜索类型切换

**优先级**: MUST

**描述**:
提供多种搜索类型切换,包括全局文本搜索、文件名搜索、内容搜索、标签搜索、元数据搜索和向量检索。

**搜索类型**:

| 搜索类型 | 描述 | 示例 |
|---------|------|------|
| **全部** | 综合所有搜索方式 | `keyword` |
| **文件名** | 仅搜索文件名 | `README` |
| **内容** | 搜索文件内容 | `function Component` |
| **标签** | 按文档标签搜索 | `#important` |
| **元数据** | 按创建时间、作者等搜索 | `created:2024-01` |
| **向量检索** | 语义相似度搜索 | `如何使用组件` |

**功能详情**:

1. **类型切换**
   - Tab 形式切换搜索类型
   - 切换类型保留搜索关键词
   - 自动重新执行搜索

2. **高级过滤**
   - 文件类型过滤 (Markdown, 代码, 图片)
   - 日期范围过滤
   - 标签组合过滤
   - 路径过滤

3. **搜索语法**
   - 支持布尔运算符 (AND, OR, NOT)
   - 支持通配符 (*, ?)
   - 支持正则表达式
   - 支持引号精确匹配

**验收标准**:
- [ ] 显示搜索类型切换 Tab
- [ ] 点击 Tab 切换搜索类型
- [ ] 切换后自动重新搜索
- [ ] 支持高级过滤选项
- [ ] 支持搜索语法

**实施状态**: ⏳ 待实现

---

### WV-LS-SP-FR-3: 全局文本搜索

**优先级**: MUST

**描述**:
在所有文档内容中搜索关键词,返回包含匹配内容的文件列表。

**功能详情**:

1. **搜索范围**
   - 所有文本文件 (.md, .txt, .json, .yaml)
   - 代码文件 (.js, .ts, .tsx, .jsx, .css, .scss)
   - 排除 node_modules, .git, dist 等目录

2. **匹配算法**
   - 大小写不敏感
   - 模糊匹配
   - 支持中英文混合搜索

3. **结果显示**
   - 显示文件路径
   - 显示匹配的上下文 (前后 50 字符)
   - 高亮匹配的关键词
   - 显示匹配数量

4. **性能优化**
   - 增量搜索 (先搜索前 100 个文件)
   - 搜索结果分页 (每页 20 条)
   - 后台索引优化

**验收标准**:
- [ ] 可以在所有文档中搜索关键词
- [ ] 显示匹配的文件和上下文
- [ ] 高亮匹配的关键词
- [ ] 显示匹配数量
- [ ] 搜索性能良好 (< 1s)

**实施状态**: ⏳ 待实现

---

### WV-LS-SP-FR-4: 文件名搜索

**优先级**: MUST

**描述**:
仅搜索文件名,快速定位文件。

**功能详情**:

1. **搜索范围**
   - 所有文件和文件夹名称
   - 包括扩展名

2. **匹配算法**
   - 大小写不敏感
   - 模糊匹配
   - 支持通配符 (*, ?)

3. **结果显示**
   - 显示文件图标
   - 显示文件路径
   - 高亮匹配的文件名
   - 按相关度排序

4. **快捷操作**
   - Enter 打开第一个结果
   - ↑/↓ 在结果间导航
   - 点击跳转到文件

**验收标准**:
- [ ] 可以搜索文件名
- [ ] 显示匹配的文件
- [ ] 高亮匹配的文件名
- [ ] 按相关度排序
- [ ] 支持快捷键操作

**实施状态**: ⏳ 待实现

---

### WV-LS-SP-FR-5: 标签/元数据搜索

**优先级**: SHOULD

**描述**:
支持按文档标签、创建时间、作者等元数据进行搜索和过滤。

**功能详情**:

1. **标签搜索**
   - 支持标签前缀 (#)
   - 多标签组合 (AND, OR)
   - 排除标签 (-#tag)

2. **元数据过滤**
   - 创建日期范围
   - 修改日期范围
   - 文件作者
   - 文件大小

3. **搜索语法**
   ```
   #important                    # 包含 important 标签
   #todo AND #urgent             # 同时包含 todo 和 urgent
   #feature -#deprecated         # 包含 feature 但不包含 deprecated
   created:>2024-01-01          # 2024-01-01 之后创建
   size:<1MB                     # 小于 1MB
   ```

4. **过滤界面**
   - 日期范围选择器
   - 标签多选器
   - 文件类型多选器

**验收标准**:
- [ ] 支持标签搜索
- [ ] 支持元数据过滤
- [ ] 支持搜索语法
- [ ] 提供过滤界面
- [ ] 过滤结果正确

**实施状态**: ⏳ 待实现

---

### WV-LS-SP-FR-6: 向量检索

**优先级**: SHOULD

**描述**:
基于语义相似度的智能搜索,支持自然语言查询。

**功能详情**:

1. **语义搜索**
   - 理解查询意图
   - 返回语义相似的结果
   - 不依赖精确关键词

2. **向量索引**
   - 文档向量化 (Embedding)
   - 持久化向量索引
   - 增量更新索引

3. **结果排序**
   - 按相似度评分排序
   - 显示相似度分数
   - 支持阈值过滤

4. **使用场景**
   - "如何创建组件"
   - "项目配置说明"
   - "API 使用示例"

**验收标准**:
- [ ] 支持自然语言查询
- [ ] 返回语义相似的结果
- [ ] 显示相似度分数
- [ ] 向量索引自动更新
- [ ] 搜索性能良好

**实施状态**: ⏳ 待实现

---

### WV-LS-SP-FR-7: 搜索结果高亮

**优先级**: MUST

**描述**:
在搜索结果中高亮显示匹配的关键词,并提供上下文预览。

**功能详情**:

1. **关键词高亮**
   - 黄色背景高亮匹配文本
   - 多个关键词分别高亮
   - 支持正则匹配高亮

2. **上下文预览**
   - 显示匹配前后的文本
   - 前后各 50-100 字符
   - 省略号截断

3. **导航功能**
   - 点击结果跳转到文件
   - 自动滚动到匹配位置
   - 在编辑器中高亮显示

4. **结果显示**
   - 文件图标和名称
   - 文件路径
   - 匹配数量
   - 相关度评分

**验收标准**:
- [ ] 匹配的关键词高亮显示
- [ ] 显示匹配上下文
- [ ] 点击结果跳转到文件
- [ ] 自动滚动到匹配位置
- [ ] 在编辑器中高亮显示

**实施状态**: ⏳ 待实现

---

### WV-LS-SP-FR-8: 搜索历史和建议

**优先级**: SHOULD

**描述**:
记录搜索历史,提供智能搜索建议。

**功能详情**:

1. **搜索历史**
   - 保存最近 50 条搜索记录
   - 点击历史记录快速搜索
   - 支持清除历史

2. **智能建议**
   - 基于搜索历史推荐
   - 基于项目内容推荐
   - 热门搜索关键词

3. **自动补全**
   - 输入时显示建议
   - 支持键盘导航
   - 自动完成常见查询

**验收标准**:
- [ ] 保存搜索历史
- [ ] 显示搜索建议
- [ ] 点击历史快速搜索
- [ ] 支持自动补全

**实施状态**: ⏳ 待实现

---

## 💾 数据结构设计

### 搜索状态

```typescript
interface SearchPanelState {
  // 搜索输入
  query: string;                  // 搜索关键词
  searchType: SearchType;         // 搜索类型
  filters: SearchFilters;         // 过滤条件

  // 搜索结果
  results: SearchResult[];        // 搜索结果列表
  totalCount: number;             // 总结果数
  loading: boolean;               // 加载状态
  error?: string;                 // 错误信息

  // UI 状态
  selectedResult: string | null;  // 选中的结果 ID
  expandedResults: Set<string>;   // 展开的结果 ID

  // 搜索历史
  history: SearchHistoryItem[];   // 搜索历史
  suggestions: string[];          // 搜索建议
}

// 搜索类型
type SearchType =
  | 'all'           // 全部
  | 'filename'      // 文件名
  | 'content'       // 内容
  | 'tags'          // 标签
  | 'metadata'      // 元数据
  | 'vector';       // 向量检索

// 过滤条件
interface SearchFilters {
  fileTypes?: string[];           // 文件类型
  tags?: string[];                // 标签
  dateRange?: {
    created?: { start: Date; end: Date };
    modified?: { start: Date; end: Date };
  };
  sizeRange?: { min: number; max: number };
  path?: string;                  // 路径过滤
}
```

### 搜索结果

```typescript
interface SearchResult {
  id: string;                     // 结果唯一标识
  type: 'file' | 'folder';        // 类型
  path: string;                   // 文件路径
  name: string;                   // 文件名
  extension?: string;             // 文件扩展名
  icon: string;                   // 图标

  // 匹配信息
  matches: MatchInfo[];           // 匹配项列表
  score: number;                  // 相关度评分 (0-1)

  // 元数据
  tags?: string[];                // 标签
  createdAt?: Date;               // 创建时间
  modifiedAt?: Date;              // 修改时间
  size?: number;                  // 文件大小
}

// 匹配信息
interface MatchInfo {
  type: 'filename' | 'content' | 'tag' | 'metadata';
  line?: number;                  // 行号 (内容匹配)
  column?: number;                // 列号
  preview: string;                // 上下文预览
  highlights: {                   // 高亮位置
    start: number;
    end: number;
  }[];
}

// 搜索历史
interface SearchHistoryItem {
  query: string;
  searchType: SearchType;
  timestamp: Date;
  resultCount: number;
}
```

---

## 🔧 技术实现要点

### 组件结构

```
components/workspace/sidebar/panels/
└── search-panel/
    ├── search-panel.tsx          # 主容器
    ├── search-input.tsx          # 搜索输入框
    ├── search-type-tabs.tsx      # 搜索类型切换
    ├── search-results.tsx        # 搜索结果列表
    ├── search-result-item.tsx    # 结果项组件
    ├── search-filters.tsx        # 过滤器
    ├── search-history.tsx        # 搜索历史
    └── search-highlight.tsx      # 高亮组件
```

### 关键技术

1. **搜索实现**: 使用 Fuse.js 或 Lunr.js
   ```typescript
   import Fuse from 'fuse.js';

   const fuse = new Fuse(files, {
     keys: ['name', 'content', 'tags'],
     threshold: 0.3,
   });
   ```

2. **向量检索**: 集成向量数据库
   ```typescript
   import { vectorDB } from '@/lib/api/vector';

   const results = await vectorDB.search(query, {
     topK: 20,
     threshold: 0.7,
   });
   ```

3. **文本高亮**: 使用自定义高亮组件
   ```typescript
   const highlightText = (text: string, query: string) => {
     // 使用正则替换实现高亮
   };
   ```

4. **防抖搜索**: 使用 lodash/debounce
   ```typescript
   import { debounce } from 'lodash';

   const debouncedSearch = debounce(
     (query: string) => performSearch(query),
     300
   );
   ```

### 性能优化

1. **增量搜索**: 先搜索部分文件,然后逐步加载更多结果
   ```typescript
   const searchIncremental = async (query: string) => {
     const batch1 = await search(query, { limit: 100 });
     setResults(batch1);

     const batch2 = await search(query, { offset: 100, limit: 100 });
     setResults(prev => [...prev, ...batch2]);
   };
   ```

2. **搜索索引**: 预先构建搜索索引
   ```typescript
   const buildSearchIndex = async () => {
     const files = await fetchAllFiles();
     const index = new Fuse.Index(['name', 'content']);
     index.addCollection(files);
     return index;
   };
   ```

3. **结果缓存**: 缓存搜索结果
   ```typescript
   const searchCache = new Map<string, SearchResult[]>();

   const cachedSearch = (query: string) => {
     if (searchCache.has(query)) {
       return searchCache.get(query);
     }
     const results = performSearch(query);
     searchCache.set(query, results);
     return results;
   };
   ```

---

## 🎨 UI/UX 设计要求

### 视觉样式

**搜索输入框**:
- 高度: 40px
- 圆角: 8px
- 图标: 左侧搜索图标 (16x16px)
- 占位符: "搜索文件..."
- 焦点边框: 2px solid #3b82f6

**搜索类型 Tab**:
- 高度: 36px
- 间距: 4px
- 激活背景: #3b82f6
- 激活文字: #ffffff

**搜索结果**:
- 项高度: 自适应 (最小 60px)
- 悬停背景: rgba(0, 0, 0, 0.04)
- 选中背景: rgba(59, 130, 246, 0.1)
- 高亮背景: #fef08a (黄色)

### 交互动画

**加载动画**: 旋转圆圈
```css
@keyframes spin {
  to { transform: rotate(360deg); }
}
.loading-spinner {
  animation: spin 1s linear infinite;
}
```

**结果进入**: 淡入 + 向上滑动
```css
@keyframes fadeInUp {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
.search-result-item {
  animation: fadeInUp 0.2s ease-out;
}
```

---

## ✅ 验收标准

### 功能完整性

- [ ] 所有搜索类型正常工作
- [ ] 全局文本搜索功能正常
- [ ] 文件名搜索功能正常
- [ ] 标签/元数据搜索功能正常
- [ ] 向量检索功能正常
- [ ] 搜索结果高亮显示
- [ ] 搜索历史和建议功能正常

### 性能要求

- [ ] 搜索响应时间 < 1s
- [ ] 大型项目 (1000+ 文件) 性能良好
- [ ] 搜索结果渲染流畅
- [ ] 防抖搜索正常工作

### 用户体验

- [ ] 搜索界面直观易用
- [ ] 搜索结果清晰易读
- [ ] 支持快捷键操作
- [ ] 错误提示友好

### 可访问性

- [ ] 支持 Tab 键导航
- [ ] 支持键盘快捷键
- [ ] 正确的 ARIA 标签
- [ ] 屏幕阅读器友好

---

## 🚀 实施进度

### Phase 1: 基础搜索功能

- [ ] 实现搜索输入框
- [ ] 实现搜索类型切换
- [ ] 实现文件名搜索
- [ ] 实现全局文本搜索
- [ ] 实现搜索结果展示

**预计工时**: 3-4 天

---

### Phase 2: 高级搜索

- [ ] 实现标签/元数据搜索
- [ ] 实现向量检索
- [ ] 实现搜索结果高亮
- [ ] 实现搜索历史和建议

**预计工时**: 4-5 天

---

### Phase 3: 性能优化

- [ ] 实现增量搜索
- [ ] 构建搜索索引
- [ ] 实现结果缓存
- [ ] 性能测试和优化

**预计工时**: 2-3 天

---

### Phase 4: 测试和优化

- [ ] 端到端功能测试
- [ ] 性能测试和优化
- [ ] 无障碍访问测试
- [ ] 边界情况处理

**预计工时**: 1-2 天

---

## 📚 相关文档

### 相关模块
- [Sidebar 概述](./overview.md)
- [Sidebar 架构](./architecture.md)
- [文件系统模块](../../file-system.md) ⏳
- [向量检索模块](../../vector-search.md) ⏳

### 技术文档
- [Fuse.js 文档](https://www.fusejs.io/)
- [Lunr.js 文档](https://lunrjs.com/)
- [Debounce 文档](https://lodash.com/docs/#debounce)

---

## 📝 变更历史

| 版本 | 日期 | 变更说明 | 作者 |
|-----|------|---------|-----|
| 1.0.0 | 2026-01-20 | 初始版本,搜索面板需求定义 | My-KM Team |

---

**文档状态**: ✅ 需求定义完成
**下一步**: 开始实施开发
