# 基础设施服务设计文档（第二批）

**创建日期**: 2026-03-26
**状态**: 待实现
**批次**: 基础设施层 - 第二批

---

## 1. 概述

本文档描述项目基础设施层三个服务的设计：
- 日志服务 (LoggerService)
- 配置服务 (ConfigService)
- 存储服务 (StorageService)

这三个服务提供应用的基础支撑能力：日志记录、用户配置管理、数据持久化。

---

## 2. 日志服务 (LoggerService)

### 2.1 职责

- 统一管理系统日志输出
- 支持多级日志（DEBUG, INFO, WARN, ERROR）
- 支持日志分类（按模块）
- 支持日志格式化
- 支持日志持久化（可选）
- 支持日志远程上报（可选）

### 2.2 核心接口

```typescript
/**
 * 日志级别
 */
enum LogLevel {
    DEBUG = 0,
    INFO = 1,
    WARN = 2,
    ERROR = 3,
    NONE = 4,
}

/**
 * 日志条目
 */
interface LogEntry {
    /** 日志级别 */
    level: LogLevel;

    /** 日志分类/来源 */
    category: string;

    /** 日志消息 */
    message: string;

    /** 附加数据 */
    data?: unknown;

    /** 时间戳 */
    timestamp: number;

    /** 调用栈（ERROR 级别） */
    stack?: string;

    /** 会话 ID */
    sessionId?: string;

    /** 用户 ID（如果有） */
    userId?: string;
}

/**
 * 日志写入器接口
 */
interface LogWriter extends IDisposable {
    /** 写入日志 */
    write(entry: LogEntry): void;

    /** 批量写入 */
    writeBatch(entries: LogEntry[]): void;
}

/**
 * 日志服务配置
 */
interface LoggerConfig {
    /** 最低日志级别 */
    minLevel?: LogLevel;

    /** 日志分类过滤 */
    categories?: Record<string, LogLevel>;

    /** 是否输出到控制台 */
    console?: boolean;

    /** 是否输出到文件 */
    file?: boolean;

    /** 是否远程上报 */
    remote?: boolean;

    /** 会话 ID */
    sessionId?: string;
}

/**
 * 日志记录器（每个模块一个实例）
 */
interface Logger {
    /** 调试日志 */
    debug(message: string, ...data: unknown[]): void;

    /** 信息日志 */
    info(message: string, ...data: unknown[]): void;

    /** 警告日志 */
    warn(message: string, ...data: unknown[]): void;

    /** 错误日志 */
    error(message: string, ...data: unknown[]): void;

    /** 设置日志级别 */
    setLevel(level: LogLevel): void;
}

/**
 * 日志服务
 */
@Service({ singleton: true })
class LoggerService extends ServiceBase {
    // 事件发射器
    private readonly _onLog = new Emitter<LogEntry>();

    /** 日志事件（可用于 UI 显示） */
    readonly onLog = this._onLog.event;

    /** 全局配置 */
    private config: LoggerConfig;

    /** 日志写入器列表 */
    private writers: LogWriter[] = [];

    /** 按分类的日志级别 */
    private categoryLevels: Map<string, LogLevel> = new Map();

    /** 会话 ID */
    private sessionId: string;

    /**
     * 初始化日志服务
     */
    initialize(config?: LoggerConfig): void;

    /**
     * 获取日志记录器
     * @param category 分类名称
     */
    getLogger(category: string): Logger;

    /**
     * 注册日志写入器
     */
    registerWriter(writer: LogWriter): IDisposable;

    /**
     * 设置全局日志级别
     */
    setLevel(level: LogLevel): void;

    /**
     * 设置分类日志级别
     */
    setCategoryLevel(category: string, level: LogLevel): void;

    /**
     * 获取日志历史
     */
    getHistory(options?: {
        level?: LogLevel;
        category?: string;
        limit?: number;
        since?: number;
    }): LogEntry[];

    /**
     * 清空日志历史
     */
    clearHistory(): void;

    /**
     * 导出日志
     */
    export(options?: {
        format?: 'json' | 'text';
        level?: LogLevel;
        category?: string;
    }): string;

    override dispose(): void;
}
```

### 2.3 使用示例

```typescript
// 初始化日志服务
loggerService.initialize({
    minLevel: LogLevel.DEBUG,
    console: true,
    file: false,
    sessionId: generateSessionId(),
});

// 获取模块日志记录器
const logger = loggerService.getLogger('file-system');

// 各级日志
logger.debug('Loading file...', { path: '/docs/test.md' });
logger.info('File loaded', { size: 1024 });
logger.warn('File is large', { size: 1024 * 1024 * 10 });
logger.error('Failed to load file', error);

// 设置分类日志级别
loggerService.setCategoryLevel('file-system', LogLevel.INFO); // 过滤 DEBUG
loggerService.setCategoryLevel('network', LogLevel.WARN); // 只显示 WARN 和 ERROR

// 注册自定义写入器（持久化到 IndexedDB）
class IndexedDBWriter implements LogWriter {
    private db: IDBDatabase;

    write(entry: LogEntry): void {
        // 写入 IndexedDB
        const transaction = this.db.transaction('logs', 'readwrite');
        transaction.objectStore('logs').add(entry);
    }

    writeBatch(entries: LogEntry[]): void {
        // 批量写入
    }

    dispose(): void {
        this.db.close();
    }
}

loggerService.registerWriter(new IndexedDBWriter());

// 监听日志事件（用于开发面板）
loggerService.onLog((entry) => {
    devToolsStore.addLog(entry);
});

// 导出日志（用于调试）
const logs = loggerService.export({ format: 'json', level: LogLevel.WARN });
console.log('导出日志:', logs);
```

### 2.4 控制台输出格式化

```typescript
class ConsoleWriter implements LogWriter {
    write(entry: LogEntry): void {
        const prefix = `[${this.formatTime(entry.timestamp)}]`;
        const category = `[${entry.category}]`;
        const level = LogLevel[entry.level];

        switch (entry.level) {
            case LogLevel.DEBUG:
                console.debug(`${prefix} ${category} [DEBUG] ${entry.message}`, entry.data || '');
                break;
            case LogLevel.INFO:
                console.info(`${prefix} ${category} [INFO] ${entry.message}`, entry.data || '');
                break;
            case LogLevel.WARN:
                console.warn(`${prefix} ${category} [WARN] ${entry.message}`, entry.data || '');
                break;
            case LogLevel.ERROR:
                console.error(`${prefix} ${category} [ERROR] ${entry.message}`, entry.data || '', entry.stack || '');
                break;
        }
    }

    private formatTime(timestamp: number): string {
        const date = new Date(timestamp);
        return date.toISOString().replace('T', ' ').substring(0, 23);
    }
}
```

### 2.5 设计决策

| 决策点 | 选择 | 理由 |
|--------|------|------|
| 日志级别 | 4 级标准 | DEBUG/INFO/WARN/ERROR |
| 分类管理 | 按模块分类 | 便于过滤和调试 |
| 写入器 | 插件模式 | 灵活扩展（控制台/文件/远程） |
| 会话 ID | 自动生成 | 便于追踪用户会话 |
| 历史记录 | 内存循环缓冲 | 开发调试用，限制大小 |

---

## 3. 配置服务 (ConfigService)

### 3.1 职责

- 统一管理用户配置和设置
- 支持配置分层（默认/用户/工作区）
- 支持配置变更通知
- 支持配置验证
- 支持配置导入导出
- 支持配置同步（未来）

### 3.2 核心接口

```typescript
/**
 * 配置层级
 */
type ConfigLevel = 'default' | 'user' | 'workspace';

/**
 * 配置定义
 */
interface ConfigDefinition<T = unknown> {
    /** 配置键（如 'editor.fontSize'） */
    key: string;

    /** 默认值 */
    defaultValue: T;

    /** 配置类型 */
    type: 'string' | 'number' | 'boolean' | 'object' | 'array';

    /** 描述 */
    description?: string;

    /** 验证函数 */
    validate?: (value: T) => boolean;

    /** 枚举值（如果是选择类型） */
    enum?: unknown[];

    /** 最小值（数字类型） */
    minimum?: number;

    /** 最大值（数字类型） */
    maximum?: number;
}

/**
 * 配置变更事件
 */
interface ConfigChangeEvent<T = unknown> {
    /** 配置键 */
    key: string;

    /** 旧值 */
    oldValue: T;

    /** 新值 */
    newValue: T;

    /** 变更来源 */
    source: ConfigLevel;
}

/**
 * 配置服务
 */
@Service({ singleton: true })
class ConfigService extends ServiceBase {
    // 事件发射器
    private readonly _onConfigChange = new Emitter<ConfigChangeEvent>();

    /** 配置变更事件 */
    readonly onConfigChange = this._onConfigChange.event;

    /** 已注册的配置定义 */
    private definitions: Map<string, ConfigDefinition> = new Map();

    /** 各层级配置值 */
    private configs: {
        default: Map<string, unknown>;
        user: Map<string, unknown>;
        workspace: Map<string, unknown>;
    };

    /**
     * 初始化配置服务
     */
    initialize(): Promise<void>;

    /**
     * 注册配置定义
     */
    registerDefinition<T>(definition: ConfigDefinition<T>): IDisposable;

    /**
     * 获取配置值（合并后的最终值）
     */
    get<T>(key: string): T;

    /**
     * 获取指定层级的配置值
     */
    getAtLevel<T>(key: string, level: ConfigLevel): T | undefined;

    /**
     * 更新配置
     */
    update<T>(key: string, value: T, level?: ConfigLevel): Promise<void>;

    /**
     * 重置配置到默认值
     */
    reset(key: string, level?: ConfigLevel): Promise<void>;

    /**
     * 检查配置是否已定义
     */
    isRegistered(key: string): boolean;

    /**
     * 获取所有配置定义
     */
    getAllDefinitions(): ConfigDefinition[];

    /**
     * 获取所有配置值
     */
    getAllConfigs(): Record<string, unknown>;

    /**
     * 导出配置
     */
    exportConfig(level?: ConfigLevel): string;

    /**
     * 导入配置
     */
    importConfig(json: string, level?: ConfigLevel): Promise<void>;

    /**
     * 验证配置值
     */
    validate(key: string, value: unknown): boolean;

    override dispose(): void;
}
```

### 3.3 使用示例

```typescript
// 注册配置定义
configService.registerDefinition({
    key: 'editor.fontSize',
    defaultValue: 14,
    type: 'number',
    description: '编辑器字体大小',
    minimum: 8,
    maximum: 72,
});

configService.registerDefinition({
    key: 'editor.theme',
    defaultValue: 'dark',
    type: 'string',
    description: '编辑器主题',
    enum: ['light', 'dark', 'high-contrast'],
});

configService.registerDefinition({
    key: 'files.autoSave',
    defaultValue: true,
    type: 'boolean',
    description: '文件自动保存',
});

configService.registerDefinition({
    key: 'workbench.sidebar.position',
    defaultValue: 'left',
    type: 'string',
    description: '侧边栏位置',
    enum: ['left', 'right'],
});

// 获取配置值
const fontSize = configService.get<number>('editor.fontSize');
const theme = configService.get<string>('editor.theme');

// 更新配置（用户层级）
await configService.update('editor.fontSize', 16, 'user');

// 更新配置（工作区层级）
await configService.update('editor.tabSize', 2, 'workspace');

// 监听配置变更
configService.onConfigChange((event) => {
    console.log(`配置变更：${event.key} = ${event.newValue}`);

    // 根据配置更新应用
    if (event.key === 'editor.theme') {
        themeService.setTheme(event.newValue);
    }
    if (event.key === 'editor.fontSize') {
        editorContainer.updateFontSize(event.newValue);
    }
});

// 重置配置
await configService.reset('editor.fontSize', 'user');

// 导出配置
const userConfig = configService.exportConfig('user');
localStorage.setItem('mykm-user-config', userConfig);

// 导入配置
await configService.importConfig(savedConfig, 'user');

// 验证配置
const valid = configService.validate('editor.fontSize', 100); // false (超出 maximum)
```

### 3.4 配置 UI 集成

```typescript
// 设置页面的配置项
function SettingItem({ configKey }: { configKey: string }) {
    const definition = configService.getAllDefinitions().find(d => d.key === configKey);
    const value = configService.get(configKey);

    const handleChange = async (newValue: unknown) => {
        if (configService.validate(configKey, newValue)) {
            await configService.update(configKey, newValue, 'user');
        }
    };

    return (
        <div className="setting-item">
            <label>{definition?.description || configKey}</label>
            {definition?.type === 'boolean' && (
                <Toggle checked={value} onChange={handleChange} />
            )}
            {definition?.type === 'string' && definition?.enum && (
                <Select value={value} options={definition.enum} onChange={handleChange} />
            )}
            {definition?.type === 'number' && (
                <Input
                    type="number"
                    value={value}
                    min={definition.minimum}
                    max={definition.maximum}
                    onChange={handleChange}
                />
            )}
        </div>
    );
}
```

### 3.5 设计决策

| 决策点 | 选择 | 理由 |
|--------|------|------|
| 配置分层 | 3 层（default/user/workspace） | 类似 VS Code，灵活覆盖 |
| 配置验证 | 注册时定义规则 | 集中管理，统一验证 |
| 存储方式 | LocalStorage + IndexedDB | 简单配置用 LS，复杂用 IDB |
| 变更通知 | 事件驱动 | 响应式更新 UI |
| 配置键格式 | 点号分隔 | 如 `editor.fontSize`，层次清晰 |

---

## 4. 存储服务 (StorageService)

### 4.1 职责

- 统一管理数据持久化
- 支持多种存储后端（LocalStorage, IndexedDB, Memory）
- 支持 KV 存储
- 支持批量操作
- 支持存储迁移
- 支持存储加密（敏感数据）

### 4.2 核心接口

```typescript
/**
 * 存储类型
 */
type StorageType = 'memory' | 'local' | 'indexeddb';

/**
 * 存储选项
 */
interface StorageOptions {
    /** 存储类型 */
    type?: StorageType;

    /** 过期时间（毫秒） */
    ttl?: number;

    /** 是否加密 */
    encrypt?: boolean;

    /** 序列化器 */
    serializer?: {
        serialize: (value: unknown) => string;
        deserialize: (text: string) => unknown;
    };
}

/**
 * 存储变更事件
 */
interface StorageChangeEvent {
    /** 存储键 */
    key: string;

    /** 旧值 */
    oldValue: unknown;

    /** 新值 */
    newValue: unknown;

    /** 存储类型 */
    type: StorageType;
}

/**
 * 存储服务
 */
@Service({ singleton: true })
class StorageService extends ServiceBase {
    // 事件发射器
    private readonly _onStorageChange = new Emitter<StorageChangeEvent>();

    /** 存储变更事件 */
    readonly onStorageChange = this._onStorageChange.event;

    /**
     * 初始化存储服务
     */
    initialize(): Promise<void>;

    /**
     * 获取值
     * @param key 存储键
     * @param defaultValue 默认值
     */
    get<T>(key: string, defaultValue?: T, options?: StorageOptions): Promise<T | undefined>;

    /**
     * 设置值
     */
    set<T>(key: string, value: T, options?: StorageOptions): Promise<void>;

    /**
     * 删除值
     */
    delete(key: string, type?: StorageType): Promise<void>;

    /**
     * 检查键是否存在
     */
    has(key: string, type?: StorageType): Promise<boolean>;

    /**
     * 获取所有键
     */
    keys(type?: StorageType): Promise<string[]>;

    /**
     * 获取所有值
     */
    values(type?: StorageType): Promise<Record<string, unknown>>;

    /**
     * 批量获取
     */
    getMany(keys: string[], options?: StorageOptions): Promise<unknown[]>;

    /**
     * 批量设置
     */
    setMany(entries: Record<string, unknown>, options?: StorageOptions): Promise<void>;

    /**
     * 清空存储
     */
    clear(type?: StorageType): Promise<void>;

    /**
     * 获取存储使用情况
     */
    getUsage(type?: StorageType): Promise<{
        used: number;
        limit: number;
        percent: number;
    }>;

    /**
     * 注册存储迁移
     */
    registerMigration(version: number, migrate: (storage: StorageService) => Promise<void>): void;

    /**
     * 执行迁移
     */
    runMigrations(): Promise<void>;

    override dispose(): void;
}
```

### 4.3 使用示例

```typescript
// 基本使用
await storageService.set('user.preferences', { theme: 'dark', fontSize: 14 });
const preferences = await storageService.get<UserPreferences>('user.preferences');

// 带默认值
const language = await storageService.get('user.language', 'zh-CN');

// 使用 IndexedDB 存储大量数据
await storageService.set('documents.cache', largeData, { type: 'indexeddb' });

// 带 TTL（临时存储）
await storageService.set('search.results', results, { ttl: 5 * 60 * 1000 }); // 5 分钟

// 批量操作
await storageService.setMany({
    'user.name': 'John',
    'user.email': 'john@example.com',
    'user.theme': 'dark',
});

const values = await storageService.getMany(['user.name', 'user.email']);

// 监听存储变更
storageService.onStorageChange((event) => {
    console.log(`存储变更：${event.key}`, event.newValue);
});

// 敏感数据加密存储
await storageService.set('user.token', secretToken, { encrypt: true });

// 存储迁移
storageService.registerMigration(2, async (storage) => {
    // 迁移 v1 到 v2
    const oldData = await storage.get('legacy.data');
    if (oldData) {
        await storage.set('new.data', transform(oldData));
        await storage.delete('legacy.data');
    }
});

await storageService.runMigrations();
```

### 4.4 与 LocalStorage 同步

```typescript
// 监听浏览器 storage 事件（多标签页同步）
window.addEventListener('storage', (event) => {
    if (event.key?.startsWith('mykm:')) {
        const key = event.key.replace('mykm:', '');
        const newValue = event.newValue ? JSON.parse(event.newValue) : null;

        // 触发内部事件
        storageService._onStorageChange.fire({
            key,
            oldValue: null,
            newValue,
            type: 'local',
        });
    }
});
```

### 4.5 设计决策

| 决策点 | 选择 | 理由 |
|--------|------|------|
| 存储分层 | 3 种类型 | 内存/LS/IDB 满足不同场景 |
| 键命名 | 点号分隔 | 如 `user.preferences`，层次清晰 |
| 序列化 | JSON | 通用，易调试 |
| 加密 | AES（可选） | 敏感数据保护 |
| TTL | 可选参数 | 临时缓存支持 |

---

## 5. 数据流

### 5.1 日志服务数据流

```
模块调用 logger.info('message')
    │
    ▼
创建 LogEntry 对象
    │
    ▼
检查日志级别（是否达到 threshold）
    │
    ├──► 未达到 → 忽略
    │
    ▼
触发 onLog 事件
    │
    ▼
写入所有注册的 Writer
    │
    ├──► ConsoleWriter → console.info
    ├──► FileWriter → 写入文件
    └──► RemoteWriter → 发送到服务器
    │
    ▼
加入历史缓冲区
```

### 5.2 配置服务数据流

```
用户修改设置
    │
    ▼
ConfigService.update(key, value, 'user')
    │
    ▼
验证配置值
    │
    ├──► 无效 → 抛出错误
    │
    ▼
更新内部存储
    │
    ▼
保存到 StorageService
    │
    ▼
触发 onConfigChange 事件
    │
    ▼
订阅者响应（更新 UI/应用状态）
```

### 5.3 存储服务数据流

```
调用 storageService.set(key, value)
    │
    ▼
序列化值
    │
    ▼
（如果加密）加密
    │
    ▼
写入存储后端
    │
    ├──► Memory → Map
    ├──► Local → localStorage
    └──► IndexedDB → IDB Transaction
    │
    ▼
触发 onStorageChange 事件
```

---

## 6. 错误处理

### 6.1 日志服务

| 错误场景 | 处理方式 |
|----------|----------|
| Writer 抛出异常 | 捕获并记录，不影响其他 Writer |
| 序列化失败 | 降级为字符串 |
| 存储空间满 | 自动清理旧日志 |

### 6.2 配置服务

| 错误场景 | 处理方式 |
|----------|----------|
| 配置值无效 | 抛出错误，不更新 |
| 配置键未定义 | 警告日志，允许存储（宽松模式） |
| 存储失败 | 抛出错误，回滚 |

### 6.3 存储服务

| 错误场景 | 处理方式 |
|----------|----------|
| LocalStorage 配额满 | 抛出错误，建议使用 IndexedDB |
| IndexedDB 不可用 | 降级到 LocalStorage |
| 解密失败 | 返回 undefined，清除损坏数据 |
| 序列化失败 | 抛出错误 |

---

## 7. 测试策略

### 7.1 单元测试

```typescript
// LoggerService 测试
describe('LoggerService', () => {
    it('应支持不同级别日志', () => {
        const logger = service.getLogger('test');
        const mock = vi.fn();
        service.onLog(mock);

        logger.debug('debug');
        logger.info('info');
        logger.warn('warn');
        logger.error('error');

        expect(mock).toHaveBeenCalledTimes(4);
    });

    it'应支持级别过滤', () => {
        service.setLevel(LogLevel.WARN);
        const logger = service.getLogger('test');

        logger.debug('should not appear');
        logger.info('should not appear');
        logger.warn('should appear');

        expect(service.getHistory().length).toBe(1);
    });

    it'应支持分类级别', () => {
        service.setCategoryLevel('verbose', LogLevel.DEBUG);
        service.setCategoryLevel('critical', LogLevel.ERROR);

        const verboseLogger = service.getLogger('verbose');
        const criticalLogger = service.getLogger('critical');

        verboseLogger.debug('debug');
        criticalLogger.debug('debug');

        expect(service.getHistory().length).toBe(1);
    });
});

// ConfigService 测试
describe('ConfigService', () => {
    it'应获取默认值', () => {
        service.registerDefinition({
            key: 'test.value',
            defaultValue: 42,
            type: 'number',
        });

        expect(service.get('test.value')).toBe(42);
    });

    it'应支持层级覆盖', async () => {
        service.registerDefinition({
            key: 'test.value',
            defaultValue: 1,
            type: 'number',
        });

        await service.update('test.value', 2, 'user');
        await service.update('test.value', 3, 'workspace');

        expect(service.get('test.value')).toBe(3); // workspace 优先
    });

    it'应触发变更事件', async () => {
        const mock = vi.fn();
        service.onConfigChange(mock);

        await service.update('test.value', 42);

        expect(mock).toHaveBeenCalledWith(
            expect.objectContaining({
                key: 'test.value',
                newValue: 42,
            })
        );
    });

    it'应验证配置值', () => {
        service.registerDefinition({
            key: 'test.range',
            defaultValue: 10,
            type: 'number',
            minimum: 0,
            maximum: 100,
        });

        expect(service.validate('test.range', 50)).toBe(true);
        expect(service.validate('test.range', 150)).toBe(false);
    });
});

// StorageService 测试
describe('StorageService', () => {
    it'应存储和获取值', async () => {
        await service.set('key', 'value');
        expect(await service.get('key')).toBe('value');
    });

    it'应支持默认值', async () => {
        expect(await service.get('nonexistent', 'default')).toBe('default');
    });

    it'应支持批量操作', async () => {
        await service.setMany({ a: 1, b: 2, c: 3 });
        const values = await service.getMany(['a', 'b', 'c']);
        expect(values).toEqual([1, 2, 3]);
    });

    it'应触发变更事件', async () => {
        const mock = vi.fn();
        service.onStorageChange(mock);

        await service.set('key', 'value');

        expect(mock).toHaveBeenCalledWith(
            expect.objectContaining({
                key: 'key',
                newValue: 'value',
            })
        );
    });
});
```

---

## 8. 实施顺序

1. **StorageService** - 最基础，其他服务依赖
2. **LoggerService** - 独立，可并行
3. **ConfigService** - 依赖 StorageService

---

## 9. 与其他服务关系

```
StorageService ─┬──► 无依赖（最基础设施）

LoggerService ──┬──► StorageService（持久化日志）
                └──► 无其他依赖

ConfigService ──┬──► StorageService（存储配置）
                ├──► LoggerService（记录变更）
                └──► EventBusService（配置变更事件）
```

---

## 10. 待决策事项

| 事项 | 状态 | 建议 |
|------|------|------|
| 日志持久化策略 | 待确认 | 开发期内存，生产期 IndexedDB |
| 配置加密 | 待确认 | 第一批不实现，预留接口 |
| 存储配额 | 待确认 | LocalStorage 5MB, IndexedDB 动态 |
| 日志远程上报 | 待确认 | 第一批不实现 |

---

## 11. 与后续批次的关系

### 依赖本服务的模块
- **所有服务** → 依赖 LoggerService 记录日志
- **所有服务** → 依赖 ConfigService 获取配置
- **所有服务** → 依赖 StorageService 持久化数据

### 本服务依赖
- **StorageService** → 无依赖
- **LoggerService** → 依赖 StorageService
- **ConfigService** → 依赖 StorageService
