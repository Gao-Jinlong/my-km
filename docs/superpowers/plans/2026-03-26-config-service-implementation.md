# ConfigService 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现配置服务，提供应用配置管理能力，支持分层配置、变更通知和持久化。

**Architecture:** ConfigService 依赖 StorageService 进行配置持久化，提供键值配置 API，支持配置变更事件通知。采用分层配置模型（默认值 → 用户配置 → 运行时覆盖）。

**Tech Stack:** TypeScript, StorageService, EventBusService

---

## 文件结构

```
apps/web/src/platform/config/
├── index.ts                 # 导出所有内容
├── service.ts              # ConfigService 实现
├── types.ts                # 类型定义和接口
└── __tests__/
    ├── types.test.ts
    └── service.test.ts
```

---

## 任务分解

### Task 1: 类型定义和接口

**Files:**
- Create: `apps/web/src/platform/config/types.ts`
- Test: `apps/web/src/platform/config/__tests__/types.test.ts`

- [ ] **Step 1: 定义配置项和配置接口**

```typescript
// apps/web/src/platform/config/types.ts

import { Event } from '@base/common/event';

export interface ConfigEntry<T = unknown> {
    /** 配置值 */
    value: T;
    /** 默认值 */
    defaultValue: T;
    /** 配置描述 */
    description?: string;
    /** 是否用户可修改 */
    userConfigurable?: boolean;
    /** 配置分类 */
    category?: string;
}

export interface ConfigChangeEvent<T = unknown> {
    /** 配置键 */
    key: string;
    /** 旧值 */
    oldValue: T;
    /** 新值 */
    newValue: T;
    /** 来源（'user' | 'system' | 'extension'） */
    source: string;
}

export interface ConfigDefinition<T = unknown> {
    /** 默认值 */
    default: T;
    /** 描述 */
    description?: string;
    /** 用户可修改 */
    userConfigurable?: boolean;
    /** 分类 */
    category?: string;
    /** 值验证函数 */
    validate?: (value: unknown) => value is T;
}
```

- [ ] **Step 2: 定义配置服务接口**

```typescript
// 接在 types.ts 后面

export interface IConfigurationService {
    /** 初始化配置服务 */
    initialize(): Promise<void>;

    /** 注册配置定义 */
    register<T>(key: string, definition: ConfigDefinition<T>): void;

    /** 获取配置值 */
    get<T>(key: string): T;

    /** 获取配置值（带默认值） */
    get<T>(key: string, defaultValue: T): T;

    /** 设置配置值 */
    set<T>(key: string, value: T): Promise<void>;

    /** 重置配置为默认值 */
    reset(key: string): Promise<void>;

    /** 检查配置是否存在 */
    has(key: string): boolean;

    /** 获取所有配置键 */
    keys(): string[];

    /** 配置变更事件 */
    onDidChangeConfig: Event<ConfigChangeEvent>;

    /** 获取配置变更事件（针对特定 key） */
    onDidChange<T>(key: string): Event<ConfigChangeEvent<T>>;
}
```

- [ ] **Step 3: 运行 TypeScript 检查类型定义**

```bash
cd apps/web && npx tsc --noEmit src/platform/config/types.ts
```

Expected: 无错误

- [ ] **Step 4: 创建类型测试文件**

```typescript
// apps/web/src/platform/config/__tests__/types.test.ts
import { describe, it, expect } from 'vitest';
import type { ConfigEntry, ConfigDefinition } from '../types';

describe('ConfigService Types', () => {
    it('应正确定义配置项', () => {
        const entry: ConfigEntry<string> = {
            value: 'dark',
            defaultValue: 'light',
            description: '主题设置',
            userConfigurable: true,
            category: 'appearance',
        };
        expect(entry.value).toBe('dark');
        expect(entry.defaultValue).toBe('light');
    });

    it('应正确定义配置定义', () => {
        const def: ConfigDefinition<number> = {
            default: 10,
            description: '字体大小',
            userConfigurable: true,
            category: 'editor',
            validate: (v): v is number => typeof v === 'number',
        };
        expect(def.default).toBe(10);
        expect(def.validate?.(20)).toBe(true);
        expect(def.validate?.('string')).toBe(false);
    });

    it('应正确定义变更事件', () => {
        const event = {
            key: 'theme',
            oldValue: 'light',
            newValue: 'dark',
            source: 'user',
        };
        expect(event.key).toBe('theme');
        expect(event.source).toBe('user');
    });
});
```

- [ ] **Step 5: 运行类型测试**

```bash
cd apps/web && npx vitest run src/platform/config/__tests__/types.test.ts
```

Expected: PASS

- [ ] **Step 6: 提交**

```bash
git add apps/web/src/platform/config/types.ts apps/web/src/platform/config/__tests__/types.test.ts
git commit -m "feat(config): 定义配置服务类型和接口"
```

---

### Task 2: ConfigService 核心实现

**Files:**
- Create: `apps/web/src/platform/config/service.ts`
- Test: `apps/web/src/platform/config/__tests__/service.test.ts`

- [ ] **Step 1: 实现 ConfigService 类**

```typescript
// apps/web/src/platform/config/service.ts

import { Service, ServiceBase, IServiceProvider } from '@platform/di';
import { Emitter } from '@base/common/event';
import type {
    IConfigurationService,
    ConfigDefinition,
    ConfigChangeEvent,
} from './types';
import { StorageService } from '@platform/storage';

const CONFIG_STORAGE_KEY = 'app.config';

@Service({ singleton: true })
export class ConfigService extends ServiceBase implements IConfigurationService {
    private readonly _onDidChangeConfig = new Emitter<ConfigChangeEvent>();
    readonly onDidChangeConfig = this._onDidChangeConfig.event;

    private definitions = new Map<string, ConfigDefinition>();
    private userConfig = new Map<string, unknown>();
    private storage?: StorageService;

    constructor(
        @IServiceProvider private serviceProvider: IServiceProvider
    ) {
        super();
    }

    /**
     * 初始化配置服务
     */
    async initialize(): Promise<void> {
        this.storage = this.serviceProvider.get(StorageService);
        await this.loadUserConfig();
    }

    /**
     * 注册配置定义
     */
    register<T>(key: string, definition: ConfigDefinition<T>): void {
        this.definitions.set(key, definition);
    }

    /**
     * 获取配置值
     */
    get<T>(key: string): T;
    get<T>(key: string, defaultValue: T): T;
    get<T>(key: string, defaultValue?: T): T {
        const definition = this.definitions.get(key);

        // 优先使用用户配置
        if (this.userConfig.has(key)) {
            return this.userConfig.get(key) as T;
        }

        // 其次使用默认值
        if (definition) {
            return definition.default as T;
        }

        // 最后使用传入的默认值
        if (defaultValue !== undefined) {
            return defaultValue;
        }

        throw new Error(`配置 "${key}" 未注册`);
    }

    /**
     * 设置配置值
     */
    async set<T>(key: string, value: T): Promise<void> {
        const definition = this.definitions.get(key);

        // 验证配置
        if (definition?.validate && !definition.validate(value)) {
            throw new Error(`配置 "${key}" 值无效`);
        }

        const oldValue = this.get(key, undefined as T);
        this.userConfig.set(key, value);

        // 触发变更事件
        this._onDidChangeConfig.fire({
            key,
            oldValue,
            newValue: value,
            source: 'user',
        });

        // 持久化
        await this.saveUserConfig();
    }

    /**
     * 重置配置为默认值
     */
    async reset(key: string): Promise<void> {
        if (!this.userConfig.has(key)) {
            return; // 已经是默认值
        }

        const definition = this.definitions.get(key);
        const oldValue = this.get(key);
        this.userConfig.delete(key);

        this._onDidChangeConfig.fire({
            key,
            oldValue,
            newValue: definition?.default as unknown,
            source: 'system',
        });

        await this.saveUserConfig();
    }

    /**
     * 检查配置是否存在
     */
    has(key: string): boolean {
        return this.definitions.has(key);
    }

    /**
     * 获取所有配置键
     */
    keys(): string[] {
        return Array.from(this.definitions.keys());
    }

    /**
     * 获取特定 key 的变更事件
     */
    onDidChange<T>(key: string) {
        return (listener: (e: ConfigChangeEvent<T>) => void) => {
            return this.onDidChangeConfig(e => {
                if (e.key === key) {
                    listener(e as ConfigChangeEvent<T>);
                }
            });
        };
    }

    override dispose(): void {
        this._onDidChangeConfig.dispose();
        this.definitions.clear();
        this.userConfig.clear();
    }

    /**
     * 加载用户配置
     */
    private async loadUserConfig(): Promise<void> {
        if (!this.storage) return;

        try {
            const config = await this.storage.get<Record<string, unknown>>(CONFIG_STORAGE_KEY);
            if (config) {
                for (const [key, value] of Object.entries(config)) {
                    this.userConfig.set(key, value);
                }
            }
        } catch (error) {
            console.warn('加载用户配置失败:', error);
        }
    }

    /**
     * 保存用户配置
     */
    private async saveUserConfig(): Promise<void> {
        if (!this.storage) return;

        try {
            const config: Record<string, unknown> = {};
            for (const [key, value] of this.userConfig.entries()) {
                config[key] = value;
            }
            await this.storage.set(CONFIG_STORAGE_KEY, config);
        } catch (error) {
            console.warn('保存用户配置失败:', error);
            throw error;
        }
    }
}
```

- [ ] **Step 2: 创建 ConfigService 测试**

```typescript
// apps/web/src/platform/config/__tests__/service.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ConfigService } from '../service';
import { StorageService } from '@platform/storage';

describe('ConfigService', () => {
    let service: ConfigService;
    let mockStorage: StorageService;

    beforeEach(async () => {
        mockStorage = {
            get: vi.fn(),
            set: vi.fn(),
        } as any;

        const mockServiceProvider = {
            get: vi.fn().mockReturnValue(mockStorage),
        } as any;

        service = new ConfigService(mockServiceProvider);
        await service.initialize();
    });

    afterEach(() => {
        service.dispose();
    });

    it('应成功初始化', async () => {
        expect(service).toBeDefined();
    });

    it('应注册配置定义', () => {
        service.register('theme', {
            default: 'light',
            description: '主题设置',
            userConfigurable: true,
        });

        expect(service.has('theme')).toBe(true);
        expect(service.has('nonexistent')).toBe(false);
    });

    it('应获取默认值', () => {
        service.register('fontSize', {
            default: 14,
            description: '字体大小',
        });

        expect(service.get('fontSize')).toBe(14);
    });

    it('应设置和获取值', async () => {
        service.register('theme', { default: 'light' });

        await service.set('theme', 'dark');
        expect(service.get('theme')).toBe('dark');
    });

    it('应触发变更事件', async () => {
        const onChange = vi.fn();
        service.onDidChangeConfig(onChange);

        service.register('theme', { default: 'light' });
        await service.set('theme', 'dark');

        expect(onChange).toHaveBeenCalledWith(
            expect.objectContaining({
                key: 'theme',
                oldValue: 'light',
                newValue: 'dark',
                source: 'user',
            })
        );
    });

    it('应重置配置', async () => {
        service.register('theme', { default: 'light' });
        await service.set('theme', 'dark');

        const onChange = vi.fn();
        service.onDidChangeConfig(onChange);

        await service.reset('theme');

        expect(service.get('theme')).toBe('light');
        expect(onChange).toHaveBeenCalled();
    });

    it'应获取所有配置键', () => {
        service.register('key1', { default: 'v1' });
        service.register('key2', { default: 'v2' });

        const keys = service.keys();
        expect(keys).toContain('key1');
        expect(keys).toContain('key2');
    });

    it'应验证配置值', async () => {
        service.register('age', {
            default: 0,
            validate: (v): v is number => typeof v === 'number' && v >= 0,
        });

        await expect(service.set('age', -1)).rejects.toThrow('值无效');
        await expect(service.set('age', 25)).resolves.not.toThrow();
    });

    it'应使用传入的默认值对于未注册配置', () => {
        const value = service.get('unknown', 'default-value');
        expect(value).toBe('default-value');
    });

    it'应对未注册且无默认值的配置抛出错误', () => {
        expect(() => service.get('unknown')).toThrow('未注册');
    });
});
```

- [ ] **Step 3: 运行 ConfigService 测试**

```bash
cd apps/web && npx vitest run src/platform/config/__tests__/service.test.ts
```

Expected: PASS

- [ ] **Step 4: 提交**

```bash
git add apps/web/src/platform/config/service.ts apps/web/src/platform/config/__tests__/service.test.ts
git commit -m "feat(config): 实现配置服务核心功能"
```

---

### Task 3: 导出和索引

**Files:**
- Create: `apps/web/src/platform/config/index.ts`

- [ ] **Step 1: 创建统一导出文件**

```typescript
// apps/web/src/platform/config/index.ts

// 服务
export { ConfigService } from './service';

// 类型
export type {
    ConfigEntry,
    ConfigChangeEvent,
    ConfigDefinition,
    IConfigurationService,
} from './types';
```

- [ ] **Step 2: 运行 TypeScript 检查所有导出**

```bash
cd apps/web && npx tsc --noEmit src/platform/config/index.ts
```

Expected: 无错误

- [ ] **Step 3: 提交**

```bash
git add apps/web/src/platform/config/index.ts
git commit -m "feat(config): 添加统一导出文件"
```

---

### Task 4: 最终验证

- [ ] **Step 1: 运行所有配置测试**

```bash
cd apps/web && npx vitest run src/platform/config/__tests__/
```

Expected: 所有测试 PASS

- [ ] **Step 2: 检查 TypeScript 类型**

```bash
cd apps/web && npx tsc --noEmit
```

Expected: 无错误

- [ ] **Step 3: 提交最终版本**

```bash
git add apps/web/src/platform/config/
git commit -m "docs(config): 完成配置服务实现"
```

---

## 提交历史摘要

1. `feat(config): 定义配置服务类型和接口`
2. `feat(config): 实现配置服务核心功能`
3. `feat(config): 添加统一导出文件`
4. `docs(config): 完成配置服务实现`

---

## 测试覆盖目标

- [ ] 类型定义正确
- [ ] 配置注册和获取正确
- [ ] 配置变更事件触发正确
- [ ] 配置持久化正确
- [ ] TypeScript 类型检查通过
