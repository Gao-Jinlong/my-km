# 搜索服务设计文档

**创建日期**: 2026-03-26
**状态**: 待实现
**批次**: 第四批（工作区层）

---

## 1. 概述

本文档描述搜索服务 (SearchService) 的设计，提供应用内全文搜索、替换能力。

---

## 2. 搜索服务 (SearchService)

### 2.1 职责

- 统一管理应用内搜索功能
- 支持全文搜索（内容搜索）
- 支持文件名搜索
- 支持替换功能
- 支持搜索结果分组和导航
- 支持增量搜索（边输入边搜索）

### 2.2 核心接口

```typescript
/**
 * 搜索范围
 */
type SearchScope = 'all' | 'currentFile' | 'openFiles' | 'folder';

/**
 * 搜索匹配项
 */
interface SearchMatch {
    /** 匹配 ID */
    id: string;

    /** 文件路径 */
    path: string;

    /** 行号 */
    lineNumber: number;

    /** 列号 */
    columnNumber: number;

    /** 匹配内容 */
    text: string;

    /** 高亮范围 */
    highlights: Array<{ start: number; length: number }>;

    /** 前后文（各显示几行） */
    preview?: {
        before: string[];
        after: string[];
    };
}

/**
 * 文件搜索结果
 */
interface FileSearchResult {
    /** 文件路径 */
    path: string;

    /** 匹配项列表 */
    matches: SearchMatch[];

    /** 匹配数量 */
    count: number;
}

/**
 * 搜索结果
 */
interface SearchResult {
    /** 搜索查询 */
    query: string;

    /** 搜索结果列表（按文件分组） */
    results: FileSearchResult[];

    /** 总匹配数 */
    totalMatches: number;

    /** 总文件数 */
    totalFiles: number;

    /** 搜索耗时（毫秒） */
    duration: number;

    /** 是否被取消 */
    cancelled: boolean;
}

/**
 * 搜索选项
 */
interface SearchOptions {
    /** 是否区分大小写 */
    caseSensitive?: boolean;

    /** 是否使用正则表达式 */
    useRegExp?: boolean;

    /** 是否全字匹配 */
    wholeWord?: boolean;

    /** 搜索范围 */
    scope?: SearchScope;

    /** 范围路径（folder 模式下） */
    folderPath?: string;

    /** 文件模式过滤 */
    includePattern?: string[];

    /** 排除模式过滤 */
    excludePattern?: string[];

    /** 最大结果数 */
    maxResults?: number;

    /** 取消令牌 */
    cancelToken?: CancellationToken;
}

/**
 * 替换结果
 */
interface ReplaceResult {
    /** 成功替换的文件数 */
    filesChanged: number;

    /** 成功替换的匹配数 */
    matchesReplaced: number;

    /** 失败的项目 */
    failures: Array<{
        path: string;
        reason: string;
    }>;
}

/**
 * 搜索历史项
 */
interface SearchHistoryItem {
    /** 查询文本 */
    query: string;

    /** 使用时间 */
    timestamp: number;

    /** 选项 */
    options: SearchOptions;
}

/**
 * 搜索服务
 */
@Service({ singleton: true })
class SearchService extends ServiceBase {
    // 事件发射器
    private readonly _onSearchStart = new Emitter<{ query: string; options: SearchOptions }>();
    private readonly _onSearchEnd = new Emitter<SearchResult>();
    private readonly _onReplaceStart = new Emitter<{ query: string; replace: string }>();
    private readonly _onReplaceEnd = new Emitter<ReplaceResult>();

    /** 搜索开始事件 */
    readonly onSearchStart = this._onSearchStart.event;

    /** 搜索结束事件 */
    readonly onSearchEnd = this._onSearchEnd.event;

    /** 替换开始事件 */
    readonly onReplaceStart = this._onReplaceStart.event;

    /** 替换结束事件 */
    readonly onReplaceEnd = this._onReplaceEnd.event;

    /** 搜索历史记录 */
    private history: SearchHistoryItem[];

    /** 当前搜索 */
    private currentSearch: SearchResult | null;

    /**
     * 执行搜索
     * @param query 搜索词
     * @param options 选项
     */
    search(query: string, options?: SearchOptions): Promise<SearchResult>;

    /**
     * 增量搜索（流式返回结果）
     * @param query 搜索词
     * @param options 选项
     * @param onProgress 进度回调
     */
    searchIncremental(
        query: string,
        options: SearchOptions,
        onProgress: (partialResult: SearchResult) => void
    ): Promise<SearchResult>;

    /**
     * 在当前文件中搜索
     */
    searchInCurrentFile(query: string, options?: SearchOptions): Promise<FileSearchResult | null>;

    /**
     * 获取上一个匹配项
     */
    findPrevious(): SearchMatch | null;

    /**
     * 获取下一个匹配项
     */
    findNext(): SearchMatch | null;

    /**
     * 跳转到匹配项
     */
    goToMatch(matchId: string): Promise<void>;

    /**
     * 执行替换（单个）
     */
    replace(matchId: string, replacement: string): Promise<void>;

    /**
     * 替换所有（当前文件）
     */
    replaceAllInFile(query: string, replacement: string, filePath?: string): Promise<ReplaceResult>;

    /**
     * 替换所有（全部文件）
     */
    replaceAll(query: string, replacement: string, options?: SearchOptions): Promise<ReplaceResult>;

    /**
     * 添加搜索历史
     */
    addToHistory(query: string, options: SearchOptions): void;

    /**
     * 获取搜索历史
     */
    getHistory(): SearchHistoryItem[];

    /**
     * 清除搜索历史
     */
    clearHistory(): void;

    /**
     * 取消当前搜索
     */
    cancelCurrentSearch(): void;

    override dispose(): void;
}
```

### 2.3 使用示例

```typescript
// 基本搜索
const result = await searchService.search('function', {
    caseSensitive: false,
    useRegExp: false,
    scope: 'all',
});

console.log(`Found ${result.totalMatches} matches in ${result.totalFiles} files`);

// 增量搜索（用于搜索面板实时反馈）
searchService.searchIncremental('hello', {
    caseSensitive: false,
}, (partialResult) => {
    // 实时更新 UI
    updateSearchResults(partialResult);
});

// 正则搜索
const result = await searchService.search(/function\s+\w+/g.source, {
    useRegExp: true,
});

// 在指定文件夹搜索
const result = await searchService.search('TODO', {
    scope: 'folder',
    folderPath: '/src',
    includePattern: ['*.ts', '*.tsx'],
    excludePattern: ['**/*.test.ts', '**/node_modules/**'],
});

// 替换所有
const replaceResult = await searchService.replaceAll(
    'oldFunction',
    'newFunction',
    {
        includePattern: ['*.ts'],
    }
);

console.log(`Replaced ${replaceResult.matchesReplaced} occurrences`);

// 导航到下一个匹配
const nextMatch = searchService.findNext();
if (nextMatch) {
    await searchService.goToMatch(nextMatch.id);
}

// 获取搜索历史
const history = searchService.getHistory();
// 显示在搜索面板中供用户快速选择
```

### 2.4 设计决策

| 决策点 | 选择 | 理由 |
|--------|------|------|
| 搜索引擎 | 自定义 + Web Worker | 不阻塞 UI 线程 |
| 增量搜索 | 防抖 + 取消 | 避免过度搜索 |
| 结果分组 | 按文件分组 | 便于用户理解 |
| 高亮显示 | 独立高亮数组 | 支持不连续高亮 |
| 替换确认 | 替换前预览 | 防止误操作 |

### 2.5 与编辑器集成

```typescript
// 编辑器中的查找命令
shortcutService.register({
    id: 'editor.find',
    shortcut: 'Ctrl+F',
    target: 'editor',
    handler: async (ctx) => {
        // 打开搜索面板
        searchPanelStore.setOpen(true);

        // 如果有选中文本，填充到搜索框
        const selection = ctx.activeEditor?.getSelection();
        if (selection?.text) {
            searchPanelStore.setQuery(selection.text);
            // 自动搜索
            await searchService.searchInCurrentFile(selection.text);
        }
    },
});

// 查找下一个
shortcutService.register({
    id: 'editor.findNext',
    shortcut: 'F3',
    target: 'editor',
    handler: async (ctx) => {
        const query = searchPanelStore.getQuery();
        if (query) {
            const next = searchService.findNext();
            if (next) {
                await searchService.goToMatch(next.id);
            }
        }
    },
});

// 查找上一个
shortcutService.register({
    id: 'editor.findPrevious',
    shortcut: 'Shift+F3',
    target: 'editor',
    handler: async (ctx) => {
        const query = searchPanelStore.getQuery();
        if (query) {
            const prev = searchService.findPrevious();
            if (prev) {
                await searchService.goToMatch(prev.id);
            }
        }
    },
});

// 替换
shortcutService.register({
    id: 'editor.replace',
    shortcut: 'Ctrl+H',
    target: 'editor',
    handler: async () => {
        searchPanelStore.setOpen(true);
        searchPanelStore.setShowReplace(true);
    },
});
```

---

## 3. 数据流

### 3.1 搜索数据流

```
用户输入搜索词
    │
    ▼
SearchPanel 更新 query 状态
    │
    ▼
（防抖后）触发 searchService.searchIncremental()
    │
    ▼
启动 Web Worker 执行搜索
    │
    ├──► 读取文件内容
    ├──► 正则/文本匹配
    └──► 收集匹配项
    │
    ▼
流式返回 partialResult
    │
    ▼
SearchPanel 更新 UI
    │
    ▼
搜索完成 → 触发 onSearchEnd
    │
    ▼
添加到搜索历史
```

### 3.2 替换数据流

```
用户输入替换内容
    │
    ▼
点击"替换"按钮
    │
    ▼
searchService.replace(matchId, replacement)
    │
    ├──► 找到匹配项
    ├──► 验证文件可写
    ├──► 执行替换
    └──► 保存文件
    │
    ▼
触发 onReplaceEnd
    │
    ▼
更新搜索结果（移除已替换项）
    │
    ▼
UI 显示替换结果
```

---

## 4. 错误处理

| 错误场景 | 处理方式 |
|----------|----------|
| 文件读取失败 | 跳过该文件，记录日志 |
| 正则表达式无效 | 抛出错误，提示用户 |
| 搜索被取消 | 返回 cancelled: true |
| 替换时文件被修改 | 重新读取文件，重试或报错 |
| 权限不足 | 记录到 failures 数组 |

---

## 5. 测试策略

```typescript
describe('SearchService', () => {
    it('应搜索纯文本', async () => {
        const result = await service.search('hello');
        expect(result.totalMatches).toBeGreaterThan(0);
    });

    it'应支持区分大小写', async () => {
        const result1 = await service.search('Hello', { caseSensitive: true });
        const result2 = await service.search('hello', { caseSensitive: true });
        expect(result1.totalMatches).not.toBe(result2.totalMatches);
    });

    it'应支持正则表达式', async () => {
        const result = await service.search(/\\w+@\\w+\\.\\w+/.source, { useRegExp: true });
        expect(result.totalMatches).toBeGreaterThan(0);
    });

    it'应支持文件过滤', async () => {
        const result = await service.search('function', {
            includePattern: ['*.ts'],
            excludePattern: ['**/*.test.ts'],
        });
        for (const fileResult of result.results) {
            expect(fileResult.path).toMatch(/\\.ts$/);
            expect(fileResult.path).not.toMatch(/\\.test\\.ts$/);
        }
    });

    it'应支持替换', async () => {
        const result = await service.replaceAll('old', 'new', {
            scope: 'currentFile',
        });
        expect(result.filesChanged).toBeGreaterThan(0);
    });

    it'应记录搜索历史', () => {
        service.addToHistory('test', {});
        const history = service.getHistory();
        expect(history.find(h => h.query === 'test')).toBeDefined();
    });
});
```

---

## 6. 与其他服务关系

```
SearchService ─┬──► FileSystemService（读取文件）
               ├──► ShortcutService（快捷键）
               ├──► ActiveFileService（当前文件）
               ├──► EditorContainer（跳转匹配）
               └──► NotificationService（错误提示）
```

---

## 7. 实施顺序

1. **基础搜索** - 纯文本，当前文件
2. **全局搜索** - 多文件，Web Worker
3. **替换功能** - 单/全部替换
4. **增量搜索** - 实时反馈

---

## 8. 待决策事项

| 事项 | 状态 | 建议 |
|------|------|------|
| 搜索引擎 | 待确认 | 使用 flexsearch 或 lunr.js |
| Web Worker 数量 | 待确认 | 单 Worker 队列处理 |
| 历史数量限制 | 待确认 | 建议 100 条 |
| 最大结果数 | 待确认 | 建议 1000 条 |
