# 基础设施服务设计文档（第三批）

**创建日期**: 2026-03-26
**状态**: 待实现
**批次**: 基础设施层 - 第三批

---

## 1. 概述

本文档描述项目基础设施层三个服务的设计：
- 生命周期服务 (LifecycleService)
- 线程池服务 (WorkerPoolService)
- 取消令牌服务 (CancellationTokenService)

这三个服务提供应用级生命周期管理、后台计算能力、异步操作取消能力。

---

## 2. 生命周期服务 (LifecycleService)

### 2.1 职责

- 统一管理应用生命周期（启动、就绪、关闭）
- 支持启动阶段管理
- 支持启动回调注册
- 支持优雅关闭
- 支持启动时间分析
- 支持崩溃恢复检测

### 2.2 核心接口

```typescript
/**
 * 应用生命周期阶段
 */
enum LifecyclePhase {
    /** 初始状态 */
    None = 'none',

    /** 正在启动 */
    Starting = 'starting',

    /** 服务初始化中 */
    InitializingServices = 'initializing_services',

    /** UI 渲染中 */
    RenderingUI = 'rendering_ui',

    /** 应用已就绪 */
    Ready = 'ready',

    /** 正在关闭 */
    ShuttingDown = 'shutting_down',

    /** 已关闭 */
    Shutdown = 'shutdown',
}

/**
 * 启动阶段记录
 */
interface StartupPhase {
    /** 阶段名称 */
    name: string;

    /** 开始时间 */
    startTime: number;

    /** 结束时间 */
    endTime?: number;

    /** 耗时（毫秒） */
    duration?: number;
}

/**
 * 关闭选项
 */
interface ShutdownOptions {
    /** 强制关闭（不等待异步操作） */
    force?: boolean;

    /** 关闭超时时间（毫秒） */
    timeout?: number;

    /** 关闭原因 */
    reason?: string;
}

/**
 * 生命周期服务
 */
@Service({ singleton: true })
class LifecycleService extends ServiceBase {
    // 事件发射器
    private readonly _onPhaseChange = new Emitter<LifecyclePhase>();
    private readonly _onReady = new Emitter<void>();
    private readonly _onWillShutdown = new Emitter<ShutdownOptions>();
    private readonly _onDidShutdown = new Emitter<ShutdownOptions>();

    /** 阶段变更事件 */
    readonly onPhaseChange = this._onPhaseChange.event;

    /** 应用就绪事件 */
    readonly onReady = this._onReady.event;

    /** 即将关闭事件 */
    readonly onWillShutdown = this._onWillShutdown.event;

    /** 已关闭事件 */
    readonly onDidShutdown = this._onDidShutdown.event;

    /** 当前阶段 */
    private currentPhase: LifecyclePhase = LifecyclePhase.None;

    /** 启动阶段记录 */
    private startupPhases: StartupPhase[] = [];

    /** 启动回调列表 */
    private readyCallbacks: Array<() => void | Promise<void>> = [];

    /** 关闭回调列表 */
    private shutdownCallbacks: Array<(options: ShutdownOptions) => void | Promise<void>> = [];

    /**
     * 启动应用
     */
    startup(): Promise<void>;

    /**
     * 进入启动阶段
     */
    enterPhase(phase: LifecyclePhase): void;

    /**
     * 注册就绪回调
     * @param callback 应用就绪时调用的函数
     */
    onReady(callback: () => void | Promise<void>): void;

    /**
     * 注册关闭回调
     */
    onWillShutdown(callback: (options: ShutdownOptions) => void | Promise<void>): void;

    /**
     * 检查应用是否已就绪
     */
    isReady(): boolean;

    /**
     * 检查应用是否正在关闭
     */
    isShuttingDown(): boolean;

    /**
     * 优雅关闭应用
     */
    shutdown(options?: ShutdownOptions): Promise<void>;

    /**
     * 获取启动性能数据
     */
    getStartupMetrics(): {
        totalDuration: number;
        phases: StartupPhase[];
        slowestPhase?: StartupPhase;
    };

    /**
     * 检测是否是崩溃后恢复
     */
    isCrashRecovery(): boolean;

    /**
     * 标记崩溃（用于下次启动检测）
     */
    markCrash(): void;

    override dispose(): void;
}
```

### 2.3 使用示例

```typescript
// ===== 应用启动流程 =====

// main.tsx 或 index.ts
async function main() {
    // 检测崩溃恢复
    if (lifecycleService.isCrashRecovery()) {
        notificationService.warning(
            '应用上次异常关闭',
            '某些数据可能未保存',
        );
    }

    // 标记正常启动（清除崩溃标记）
    lifecycleService.markClean();

    // 启动应用
    await lifecycleService.startup();
}

// LifecycleService 内部实现
async function startup() {
    this.enterPhase(LifecyclePhase.Starting);

    // 阶段 1: 初始化服务
    this.enterPhase(LifecyclePhase.InitializingServices);
    const phase1Start = performance.now();

    await this.initializeServices();

    this.recordPhase('initialize_services', phase1Start);

    // 阶段 2: 渲染 UI
    this.enterPhase(LifecyclePhase.RenderingUI);
    const phase2Start = performance.now();

    await this.renderUI();

    this.recordPhase('render_ui', phase2Start);

    // 阶段 3: 应用就绪
    this.enterPhase(LifecyclePhase.Ready);

    // 执行所有就绪回调
    for (const callback of this.readyCallbacks) {
        await callback();
    }

    // 触发就绪事件
    this._onReady.fire();

    // 记录启动性能
    const metrics = this.getStartupMetrics();
    logger.info(`应用启动完成，总耗时：${metrics.totalDuration.toFixed(2)}ms`);
}

// ===== 模块注册回调 =====

// 编辑器模块
lifecycleService.onReady(async () => {
    // 应用就绪后初始化编辑器
    await editorContainer.initialize();
});

// 文件树模块
lifecycleService.onReady(() => {
    fileTreeStore.load();
});

// ===== 优雅关闭 =====

// 注册关闭回调（保存状态）
lifecycleService.onWillShutdown(async (options) => {
    if (options.force) {
        // 强制关闭，快速保存
        await storageService.set('quick.state', { openedFiles: [] });
    } else {
        // 正常关闭，完整保存
        await activeFileService.saveAll();
        await workspaceService.saveState();
    }
});

// 用户点击关闭按钮
window.addEventListener('beforeunload', async (event) => {
    if (lifecycleService.isShuttingDown()) {
        return;
    }

    // 有未保存的文件
    if (activeFileService.hasUnsavedFiles()) {
        event.preventDefault();
        event.returnValue = '';
        return '有未保存的文件，确定要关闭吗？';
    }

    // 开始关闭流程
    await lifecycleService.shutdown();
});

// ===== 启动性能分析 =====

const metrics = lifecycleService.getStartupMetrics();
console.table(metrics.phases);

// 输出：
// Phase                    Duration
// initialize_services      234.5ms
// render_ui                156.2ms
// ...
```

### 2.4 崩溃恢复检测

```typescript
isCrashRecovery(): boolean {
    const lastStatus = localStorage.getItem('app.lifecycle');
    if (lastStatus === 'running') {
        // 上次标记为运行中，说明非正常关闭
        return true;
    }
    return false;
}

markClean(): void {
    localStorage.setItem('app.lifecycle', 'running');
}

markCrash(): void {
    // 这个函数可能不会执行（如果是崩溃）
    // 所以用 beforeunload 事件
    localStorage.removeItem('app.lifecycle');
}

// 在 window 加载时检查
window.addEventListener('beforeunload', () => {
    if (this.currentPhase === LifecyclePhase.Ready) {
        localStorage.setItem('app.lifecycle', 'shutdown');
    }
});
```

### 2.5 设计决策

| 决策点 | 选择 | 理由 |
|--------|------|------|
| 阶段管理 | 枚举状态 | 清晰定义每个阶段 |
| 启动回调 | 数组顺序执行 | 简单可靠，可等待 |
| 关闭超时 | 可选参数 | 防止无限等待 |
| 崩溃检测 | LocalStorage 标记 | 简单有效 |
| 性能分析 | 记录每阶段耗时 | 优化启动速度 |

---

## 3. 线程池服务 (WorkerPoolService)

### 3.1 职责

- 统一管理 Web Worker 线程池
- 支持任务队列和调度
- 支持任务优先级
- 支持任务取消
- 支持自动扩缩容
- 提供 Worker 通信抽象

### 3.2 核心接口

```typescript
/**
 * Worker 任务
 */
interface WorkerTask<T = unknown, R = unknown> {
    /** 任务 ID */
    id: string;

    /** 任务类型 */
    type: string;

    /** 任务数据 */
    payload: T;

    /** 优先级（数字越大越优先） */
    priority?: number;

    /** 取消令牌 */
    cancelToken?: CancellationToken;

    /** 完成回调 */
    onComplete?: (result: R) => void;

    /** 错误回调 */
    onError?: (error: Error) => void;

    /** 进度回调 */
    onProgress?: (progress: number) => void;
}

/**
 * Worker 任务结果
 */
interface TaskResult<R = unknown> {
    /** 任务 ID */
    taskId: string;

    /** 结果数据 */
    data?: R;

    /** 错误信息 */
    error?: Error;

    /** 耗时（毫秒） */
    duration: number;

    /** 使用的 Worker ID */
    workerId: string;
}

/**
 * Worker 配置
 */
interface WorkerConfig {
    /** 最小 Worker 数量 */
    minWorkers?: number;

    /** 最大 Worker 数量 */
    maxWorkers?: number;

    /** Worker 空闲超时（毫秒） */
    idleTimeout?: number;

    /** Worker 脚本 URL */
    workerUrl: string;
}

/**
 * 线程池服务
 */
@Service({ singleton: true })
class WorkerPoolService extends ServiceBase {
    // 事件发射器
    private readonly _onTaskComplete = new Emitter<TaskResult>();
    private readonly _onTaskError = new Emitter<{ taskId: string; error: Error }>();

    /** 任务完成事件 */
    readonly onTaskComplete = this._onTaskComplete.event;

    /** 任务错误事件 */
    readonly onTaskError = this._onTaskError.event;

    /** Worker 池配置 */
    private config: WorkerConfig;

    /** Worker 实例列表 */
    private workers: Array<{
        id: string;
        worker: Worker;
        busy: boolean;
        currentTaskId?: string;
        lastActiveTime: number;
    }> = [];

    /** 任务队列 */
    private taskQueue: WorkerTask[] = [];

    /** 进行中的任务 */
    private runningTasks = new Map<string, WorkerTask>();

    /**
     * 初始化线程池
     */
    initialize(config: WorkerConfig): void;

    /**
     * 提交任务
     * @param task 任务定义
     * @returns Promise<TaskResult>
     */
    submit<T, R>(task: Omit<WorkerTask<T, R>, 'id'>): Promise<R>;

    /**
     * 批量提交任务
     */
    submitBatch<T, R>(tasks: Array<Omit<WorkerTask<T, R>, 'id'>>): Promise<R[]>;

    /**
     * 取消任务
     */
    cancelTask(taskId: string): boolean;

    /**
     * 取消所有任务
     */
    cancelAll(): void;

    /**
     * 获取任务状态
     */
    getTaskStatus(taskId: string): 'queued' | 'running' | 'completed' | 'cancelled' | 'failed';

    /**
     * 获取池状态
     */
    getPoolStatus(): {
        totalWorkers: number;
        busyWorkers: number;
        idleWorkers: number;
        queuedTasks: number;
        runningTasks: number;
    };

    /**
     * 等待所有任务完成
     */
    waitForAll(): Promise<void>;

    /**
     * 销毁线程池
     */
    override dispose(): void;
}
```

### 3.3 Worker 脚本示例

```typescript
// workers/search.worker.ts
import { expose } from 'comlink'; // 或使用 postMessage 原生 API

interface SearchPayload {
    query: string;
    documents: string[];
    options: {
        caseSensitive: boolean;
        useRegExp: boolean;
    };
}

interface SearchResult {
    matches: Array<{
        documentIndex: number;
        lineNumber: number;
        text: string;
    }>;
}

async function search(payload: SearchPayload): Promise<SearchResult> {
    const { query, documents, options } = payload;
    const matches: SearchResult['matches'] = [];

    const regex = options.useRegExp
        ? new RegExp(query, options.caseSensitive ? 'g' : 'gi')
        : new RegExp(escapeRegExp(query), options.caseSensitive ? 'g' : 'gi');

    for (let docIndex = 0; docIndex < documents.length; docIndex++) {
        const lines = documents[docIndex].split('\n');

        for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
            const line = lines[lineIndex];
            if (regex.test(line)) {
                matches.push({
                    documentIndex: docIndex,
                    lineNumber: lineIndex,
                    text: line,
                });
            }
        }
    }

    return { matches };
}

function escapeRegExp(string: string): string {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

expose(search);
```

### 3.4 使用示例

```typescript
// 初始化线程池
workerPoolService.initialize({
    minWorkers: 2,
    maxWorkers: navigator.hardwareConcurrency || 4,
    idleTimeout: 30000, // 30 秒空闲回收
    workerUrl: new URL('./workers/search.worker.ts', import.meta.url).href,
});

// 提交搜索任务
const result = await workerPoolService.submit<SearchPayload, SearchResult>({
    type: 'search',
    payload: {
        query: 'hello',
        documents: largeDocumentArray,
        options: { caseSensitive: false, useRegExp: false },
    },
    onProgress: (progress) => {
        searchPanelStore.setProgress(progress);
    },
});

console.log('搜索结果:', result);

// 批量提交
const tasks = [
    { type: 'search', payload: { ... } },
    { type: 'index', payload: { ... } },
    { type: 'highlight', payload: { ... } },
];

const results = await workerPoolService.submitBatch(tasks);

// 带优先级的任务
workerPoolService.submit({
    type: 'search',
    payload: { ... },
    priority: 100, // 高优先级，插队
});

workerPoolService.submit({
    type: 'index',
    payload: { ... },
    priority: 10, // 低优先级，等待
});

// 取消任务
const taskId = workerPoolService.submit({ ... });
workerPoolService.cancelTask(taskId);

// 获取池状态
const status = workerPoolService.getPoolStatus();
console.log(`Worker: ${status.busyWorkers}/${status.totalWorkers} 繁忙`);
console.log(`任务队列：${status.queuedTasks} 等待`);

// 监听任务完成
workerPoolService.onTaskComplete((result) => {
    console.log(`任务 ${result.taskId} 完成，耗时：${result.duration}ms`);
});
```

### 3.5 设计决策

| 决策点 | 选择 | 理由 |
|--------|------|------|
| Worker 管理 | 动态扩缩容 | 根据负载自动调整 |
| 任务调度 | 优先级队列 | 重要任务优先执行 |
| 通信方式 | Promise + 事件 | 统一的异步 API |
| 任务超时 | 可选参数 | 防止长时间占用 |
| 错误处理 | 任务级错误 | 单个任务失败不影响其他 |

---

## 4. 取消令牌服务 (CancellationTokenService)

### 4.1 职责

- 统一管理异步操作的取消
- 支持取消令牌创建和传递
- 支持取消源（CancellationTokenSource）
- 支持超时自动取消
- 支持级联取消（父子令牌）
- 支持取消回调

### 4.2 核心接口

```typescript
/**
 * 取消令牌
 */
interface CancellationToken {
    /** 是否已取消 */
    isCancellationRequested: boolean;

    /** 取消事件 */
    onCancellationRequested: Event<unknown>;

    /** 关联的父令牌（如果有） */
    parent?: CancellationToken;
}

/**
 * 取消令牌源
 */
interface CancellationTokenSource {
    /** 令牌 */
    token: CancellationToken;

    /** 取消令牌 */
    cancel(): void;

    /** 销毁源 */
    dispose(): void;
}

/**
 * 取消选项
 */
interface CancellationOptions {
    /** 超时时间（毫秒） */
    timeout?: number;

    /** 父令牌（级联取消） */
    parent?: CancellationToken;

    /** 取消回调 */
    onCancel?: () => void;
}

/**
 * 取消令牌服务
 */
@Service({ singleton: true })
class CancellationTokenService extends ServiceBase {
    /**
     * 创建取消令牌源
     * @param options 选项
     */
    createSource(options?: CancellationOptions): CancellationTokenSource;

    /**
     * 创建已取消的令牌
     */
    cancelled(): CancellationToken;

    /**
     * 创建永不取消的令牌
     */
    none(): CancellationToken;

    /**
     * 创建超时令牌
     * @param timeout 超时时间（毫秒）
     */
    timeout(timeout: number): CancellationTokenSource;

    /**
     * 注册取消回调
     * @param token 令牌
     * @param callback 取消时调用的函数
     * @returns IDisposable
     */
    onCancellation(token: CancellationToken, callback: () => void): IDisposable;

    /**
     * 检查是否可取消
     */
    canCancel(token?: CancellationToken): boolean;

    /**
     * 抛出如果已取消
     * @throws OperationCancelledError
     */
    throwIfCancelled(token?: CancellationToken): void;

    /**
     * 包装 Promise，支持取消
     */
    withCancellation<T>(
        promise: Promise<T>,
        token: CancellationToken,
        onCancel?: () => void
    ): Promise<T>;

    override dispose(): void;
}

/**
 * 操作已取消错误
 */
class OperationCancelledError extends Error {
    constructor(message?: string) {
        super(message || 'Operation cancelled');
        this.name = 'OperationCancelledError';
    }
}
```

### 4.3 实现示例

```typescript
// CancellationToken 实现
class CancellationTokenImpl implements CancellationToken {
    private _isCancelled = false;
    private _emitter?: Emitter<unknown>;
    private _parent?: CancellationToken;
    private _parentDisposable?: IDisposable;

    constructor(parent?: CancellationToken) {
        this._parent = parent;

        if (parent?.onCancellationRequested) {
            this._parentDisposable = parent.onCancellationRequested(() => {
                this.cancel();
            });
        }
    }

    get isCancellationRequested(): boolean {
        return this._isCancelled;
    }

    get onCancellationRequested: Event<unknown> = (listener: Listener<unknown>) => {
        if (!this._emitter) {
            this._emitter = new Emitter<unknown>();
        }
        return this._emitter.event(listener);
    };

    cancel(): void {
        if (this._isCancelled) return;

        this._isCancelled = true;
        this._emitter?.fire(undefined);
        this._parentDisposable?.dispose();
    }

    dispose(): void {
        this._emitter?.dispose();
        this._parentDisposable?.dispose();
    }
}

// CancellationTokenSource 实现
class CancellationTokenSourceImpl implements CancellationTokenSource {
    private _token: CancellationTokenImpl;
    private _isDisposed = false;

    constructor(options?: CancellationOptions) {
        this._token = new CancellationTokenImpl(options?.parent);

        if (options?.timeout) {
            const timer = setTimeout(() => {
                this.cancel();
            }, options.timeout);

            this._token.onCancellationRequested(() => {
                clearTimeout(timer);
            });
        }

        if (options?.onCancel) {
            this._token.onCancellationRequested(options.onCancel);
        }
    }

    get token(): CancellationToken {
        return this._token;
    }

    cancel(): void {
        if (this._isDisposed) return;
        this._token.cancel();
    }

    dispose(): void {
        if (this._isDisposed) return;
        this._isDisposed = true;
        this._token.dispose();
    }
}
```

### 4.4 使用示例

```typescript
// 基本取消
const source = cancellationTokenService.createSource();

searchButton.addEventListener('click', async () => {
    // 取消之前的搜索
    source.cancel();

    // 创建新的搜索
    source = cancellationTokenService.createSource();

    try {
        const result = await performSearch(query, source.token);
        console.log('搜索结果:', result);
    } catch (error) {
        if (error instanceof OperationCancelledError) {
            console.log('搜索已取消');
        } else {
            throw error;
        }
    }
});

cancelButton.addEventListener('click', () => {
    source.cancel();
});

// 超时取消
const timeoutSource = cancellationTokenService.timeout(5000); // 5 秒超时

try {
    const result = await longRunningOperation(timeoutSource.token);
} catch (error) {
    if (error instanceof OperationCancelledError) {
        console.log('操作超时');
    }
}

// 级联取消（父子令牌）
const parentSource = cancellationTokenService.createSource();
const childSource = cancellationTokenService.createSource({
    parent: parentSource.token,
});

// 父令牌取消时，子令牌也会取消
parentSource.cancel();
console.log(childSource.token.isCancellationRequested); // true

// 包装 Promise
const result = await cancellationTokenService.withCancellation(
    fetchLargeData(),
    source.token,
    () => {
        console.log('正在取消数据获取...');
    }
);

// 在异步函数中检查取消
async function performSearch(query: string, token: CancellationToken) {
    for (let i = 0; i < documents.length; i++) {
        // 检查是否已取消
        cancellationTokenService.throwIfCancelled(token);

        // 搜索逻辑
        await searchDocument(documents[i]);

        // 或者使用回调方式
        if (token.isCancellationRequested) {
            return { cancelled: true };
        }
    }
}

// 与 Worker 集成
workerPoolService.submit({
    type: 'search',
    payload: { ... },
    cancelToken: source.token,
});
```

### 4.5 设计决策

| 决策点 | 选择 | 理由 |
|--------|------|------|
| 令牌模式 | Source/Token 分离 | 类似 C# CancellationToken |
| 级联取消 | 父令牌传播 | 支持操作树取消 |
| 超时支持 | 内置 timeout 方法 | 常用模式简化 |
| 错误处理 | 专用错误类型 | 便于捕获判断 |
| Promise 包装 | withCancellation 方法 | 统一取消模式 |

---

## 5. 数据流

### 5.1 生命周期数据流

```
应用加载
    │
    ▼
LifecycleService.startup()
    │
    ├──► enterPhase(Starting)
    ├──► enterPhase(InitializingServices)
    │        └── 初始化所有服务
    ├──► enterPhase(RenderingUI)
    │        └── 渲染 React 根组件
    └──► enterPhase(Ready)
             └── 执行 onReady 回调
             └── 触发 onReady 事件
```

### 5.2 Worker 池数据流

```
提交任务
    │
    ▼
检查空闲 Worker
    │
    ├──► 有空闲 → 分配任务 → 执行
    │
    └──► 无空闲 → 加入队列
             │
             ▼
             检查是否可扩容
             │
             ├──► 可扩容 → 创建 Worker → 执行
             └──► 不可扩容 → 等待
```

### 5.3 取消令牌数据流

```
创建 Source
    │
    ▼
获取 Token
    │
    ▼
传递给异步操作
    │
    ▼
操作中定期检查 isCancellationRequested
    │
    ├──► true → 清理并返回
    └──► false → 继续执行

用户点击取消
    │
    ▼
source.cancel()
    │
    ▼
触发 onCancellationRequested 事件
    │
    ▼
所有监听器收到通知
```

---

## 6. 错误处理

### 6.1 生命周期服务

| 错误场景 | 处理方式 |
|----------|----------|
| 启动失败 | 记录错误，显示错误页面 |
| 关闭回调失败 | 记录日志，继续其他回调 |
| 关闭超时 | 强制关闭（如果 force 选项） |

### 6.2 Worker 池服务

| 错误场景 | 处理方式 |
|----------|----------|
| Worker 创建失败 | 降级到主线程执行 |
| 任务执行失败 | reject Promise，记录日志 |
| Worker 崩溃 | 移除 Worker，重试任务 |
| 队列溢出 | 拒绝新任务，返回错误 |

### 6.3 取消令牌服务

| 错误场景 | 处理方式 |
|----------|----------|
| 已取消的源再次取消 | 无操作（幂等） |
| 已销毁的源操作 | 忽略 |
| 父令牌已取消 | 子令牌立即取消 |

---

## 7. 测试策略

### 7.1 单元测试

```typescript
// LifecycleService 测试
describe('LifecycleService', () => {
    it('应支持阶段转换', () => {
        service.enterPhase(LifecyclePhase.Starting);
        service.enterPhase(LifecyclePhase.Ready);

        expect(service.isReady()).toBe(true);
    });

    it'应执行就绪回调', async () => {
        const mock = vi.fn();
        service.onReady(mock);

        await service.startup();

        expect(mock).toHaveBeenCalled();
    });

    it'应执行关闭回调', async () => {
        const mock = vi.fn();
        service.onWillShutdown(mock);

        await service.shutdown();

        expect(mock).toHaveBeenCalled();
    });
});

// WorkerPoolService 测试
describe('WorkerPoolService', () => {
    it'应提交任务并返回结果', async () => {
        service.initialize({ workerUrl: 'test.worker.ts' });

        const result = await service.submit({
            type: 'echo',
            payload: { value: 'hello' },
        });

        expect(result).toBe('hello');
    });

    it'应支持任务优先级', async () => {
        // 提交低优先级任务
        service.submit({ type: 'slow', payload: {}, priority: 10 });

        // 提交高优先级任务
        const highPriorityResult = service.submit({
            type: 'fast',
            payload: {},
            priority: 100,
        });

        // 高优先级应该先完成
        await expect(highPriorityResult).resolves.toBeDefined();
    });

    it'应支持取消任务', async () => {
        const promise = service.submit({ type: 'slow', payload: {} });

        // 取消所有任务
        service.cancelAll();

        await expect(promise).rejects.toThrow('Cancelled');
    });
});

// CancellationTokenService 测试
describe('CancellationTokenService', () => {
    it'应创建可取消的令牌', () => {
        const source = service.createSource();
        expect(source.token.isCancellationRequested).toBe(false);

        source.cancel();
        expect(source.token.isCancellationRequested).toBe(true);
    });

    it'应支持超时取消', async () => {
        const source = service.timeout(100);

        await new Promise(resolve => setTimeout(resolve, 150));

        expect(source.token.isCancellationRequested).toBe(true);
    });

    it'应支持级联取消', () => {
        const parent = service.createSource();
        const child = service.createSource({ parent: parent.token });

        parent.cancel();

        expect(child.token.isCancellationRequested).toBe(true);
    });

    it'应支持 withCancellation', async () => {
        const source = service.createSource();

        const promise = service.withCancellation(
            new Promise(resolve => setTimeout(resolve, 1000)),
            source.token
        );

        source.cancel();

        await expect(promise).rejects.toThrow('Operation cancelled');
    });
});
```

---

## 8. 实施顺序

1. **CancellationTokenService** - 最基础，其他服务可能依赖
2. **LifecycleService** - 独立，应用启动需要
3. **WorkerPoolService** - 依赖 CancellationService

---

## 9. 与其他服务关系

```
CancellationTokenService ─┬──► 无依赖

LifecycleService ─┬──► LoggerService（记录启动日志）
                  ├──► EventBusService（启动事件）
                  └──► 所有服务（启动时初始化）

WorkerPoolService ─┬──► CancellationTokenService（任务取消）
                   └──► LoggerService（记录日志）
```

---

## 10. 待决策事项

| 事项 | 状态 | 建议 |
|------|------|------|
| Worker 通信库 | 待确认 | comlink 或原生 postMessage |
| Worker 脚本打包 | 待确认 | 独立 bundle 或 inline blob |
| 崩溃上报 | 待确认 | 第一批仅本地检测 |
| 启动性能上报 | 待确认 | 第一批仅控制台输出 |

---

## 11. 总结

本批次三个服务提供应用级基础设施：

| 服务 | 价值 | 复杂度 |
|------|------|--------|
| LifecycleService | 应用生命周期管理 | 中 |
| WorkerPoolService | 后台计算能力 | 高 |
| CancellationTokenService | 异步操作取消 | 中 |

建议实施顺序：CancellationTokenService → LifecycleService → WorkerPoolService
