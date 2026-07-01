# 前端依赖注入（DI）使用规范

> 本文档是前端 DI 系统的**操作规范**。写服务、注入依赖、写测试前必读。
> 概览见 [platform/services.md](../frontend/platform/services.md)。

---

## 核心规则（TL;DR）

1. **依赖通过构造函数注入**，不要在服务里 `container.get(X)`。
2. **生产代码用 `@Inject(Class)` 显式标注**每个构造函数参数（跨环境一致性，见 [测试约束](#测试约束)）。
3. **`@Lazy()` 破解循环依赖**，不要用 getter + `container.get` 绕过。
4. **React 组件用 `useService(Class)`**，非组件代码用 `getService(Class)`。
5. **禁止 import `container` / `getContainer`** 到服务文件——这会重新引入 service-locator 反模式。

---

## 文件位置

| 文件 | 职责 |
|------|------|
| `platform/di/decorators.ts` | `@Service` / `@Inject` / `@Lazy` / `@Optional` 装饰器定义。**`reflect-metadata` 在此加载** |
| `platform/di/container.ts` | `ServiceContainer`：注册、解析、循环检测、validate |
| `platform/di/hooks.ts` | `useService()` React hook + `getService()` 工具函数 |
| `platform/di/index.ts` | 公开 API barrel export |
| `platform/bootstrap.ts` | 全局容器实例 + 所有服务的 `register()` 列表 |

---

## 定义服务

所有服务继承 `ServiceBase`，用 `@Service()` 标记：

```typescript
import { ServiceBase } from '@/platform/base/service-base';
import { Inject, Service } from '@/platform/di';

@Service({ singleton: true })          // 默认就是 singleton，可省略 options
export class MyService extends ServiceBase {
    // ...事件发射器、业务方法
}
```

- **singleton（默认）**：全应用一个实例，容器缓存。
- **transient**：`@Service({ singleton: false })`，每次 `get()` 新建。
- 服务 ID 默认 = 类名。需要自定义：`@Service({ id: 'myService' })`。

---

## 注入依赖（构造函数注入）

### 标准模式：`@Inject(Class)`

```typescript
@Service()
export class CommandService extends ServiceBase {
    private readonly _logger: Logger;

    constructor(@Inject(MonitorService) monitorService: MonitorService) {
        super();
        this._logger = monitorService.getLogger('command');
    }

    protected get logger(): Logger {
        return this._logger;   // 保留 getter 给子类，但内部是 readonly 字段
    }
}
```

**规则**：
- 构造函数参数**每个都要标 `@Inject(Class)`**（即使只有一个依赖）。
- 依赖存为 `private readonly` 字段。
- 不要用 `?` 可选字段 + lazy getter 的旧模式。

### 多依赖

```typescript
@Service()
export class FileOpenService extends ServiceBase {
    constructor(
        @Inject(FileSystemService) fileService: FileSystemService,
        @Inject(EditorContainer) editorContainer: EditorContainer,
        @Inject(EditorTabService) editorTabService: EditorTabService,
        @Inject(DocumentStore) documentStore: DocumentStore,
        @Inject(MonitorService) monitorService: MonitorService,
    ) {
        super();
        // 赋值给 readonly 字段
    }
}
```

### interface / 字符串 token：`@Inject('TOKEN')`

当依赖类型是 interface（编译后 `design:paramtypes` 丢失具体类型），用字符串 token：

```typescript
@Service()
export class MyService extends ServiceBase {
    constructor(@Inject('LOGGER') logger: Logger) {   // Logger 是 interface
        super();
    }
}
```

> 目前项目里 `MonitorService.getLogger()` 返回 `Logger`（interface），
> 但实际注入的是 `MonitorService`（class）再调 `.getLogger()`，所以不需要字符串 token。

### 可选依赖：`@Optional()`

```typescript
constructor(
    @Inject(RequiredService) required: RequiredService,
    @Inject('maybeRegistered') @Optional() optional?: SomeService,  // 未注册时 = undefined
) { ... }
```

---

## 循环依赖：`@Lazy()`

当 A 依赖 B、B 依赖 A 时，**至少一边**标 `@Lazy()`：

```typescript
@Service()
class ServiceA {
    constructor(@Inject(ServiceB) @Lazy() public b: ServiceB) {}
}

@Service()
class ServiceB {
    constructor(@Inject(ServiceA) @Lazy() public a: ServiceA) {}
}
```

容器检测到循环时返回一个 **Proxy**，首次属性访问时才真正解析实例。

**注意事项**：
- `@Lazy()` 注入的是代理对象，方法调用、属性访问、`instanceof` 都能正确转发。
- 但 **`proxy === realInstance` 为 false**（代理是独立对象）。不要对 lazy 依赖做引用相等比较。
- 优先重构消除循环；`@Lazy` 是兜底手段。

---

## 在 React 组件中使用服务

```typescript
'use client';
import { useService } from '@/platform/di';
import { CommandService } from '@/platform/command/service';

function MyComponent() {
    const commandService = useService(CommandService);
    // commandService 是单例，不会触发 re-render
}
```

- `useService` 返回单例实例，**无 re-render 语义**。
- 服务状态变化需要驱动 UI 时，订阅服务的事件（`onXxx`），用 `useSyncExternalStore` 或 `useState` + `useEffect`。

### 非组件代码（工具函数、非 React 模块）

```typescript
import { getService } from '@/platform/di';
import { EventBusService } from '@/platform/event-bus/service';

function doSomething() {
    const eventBus = getService(EventBusService);
    eventBus.emit(...);
}
```

---

## 注册服务

在 `platform/bootstrap.ts` 的 `createServiceContainer()` 中注册：

```typescript
function createServiceContainer(): ServiceContainer {
    const container = new ServiceContainer();
    container.register(MonitorService);
    container.register(MyNewService);      // ← 加在这里
    // ...
    return container;
}
```

- **注册顺序无关**——容器在 `get()` 时按需实例化并递归解析依赖。
- 新增服务后同步更新 `bootstrap.ts`，否则 `get()` 会报 `Service "X" not registered`。

### bootstrap 期 wiring 函数

`conditional/evaluators.ts` 这类**在 `bootstrap()` 中调用的 wiring 函数**（非服务构造函数），
可以用 `getContainer().get(Class)` 获取已实例化的服务——这是合理的，因为它不是服务构造函数。

---

## 不要做什么

### ❌ 禁止：service-locator getter

```typescript
// 错误 —— 依赖对容器不可见，无法 validate/检测循环
@Service()
class BadService extends ServiceBase {
    private _dep?: MyDependency;
    private get dep(): MyDependency {
        if (!this._dep) this._dep = container.get(MyDependency);  // ❌
        return this._dep;
    }
}
```

```typescript
// 正确
@Service()
class GoodService extends ServiceBase {
    constructor(@Inject(MyDependency) private readonly dep: MyDependency) {  // ✓
        super();
    }
}
```

### ❌ 禁止：在服务文件 import `container`

```typescript
import { container } from '@/platform/bootstrap';  // ❌ 服务文件不应依赖全局容器
```

服务文件只应 import `@/platform/di` 的装饰器。`container`/`getContainer` 仅用于：
- `bootstrap.ts`（注册）
- wiring 函数（`evaluators.ts` 等）
- `hooks.ts`（`useService`/`getService` 实现）

### ❌ 禁止：构造函数里做重逻辑

构造函数只做字段赋值和**注册监听器**。避免在构造期触发网络请求、读取文件等异步操作——
这些放到显式的 `init()` 方法中，由 `bootstrap()` 调用。

---

## 测试约束 ⚠️

vitest 默认使用 **esbuild** 转译，**不输出 `design:paramtypes` 元数据**。
因此：

- **纯类型推断**（无 `@Inject` 的构造函数参数）在测试环境**不工作**。
- **生产构建（Next.js/SWC）正常**输出 `design:paramtypes`。

**结论：生产代码每个构造函数参数都标 `@Inject(Class)`**，保证测试和生产一致。

### 单测中实例化服务

服务有构造函数依赖时，测试中传入 mock：

```typescript
import { createMockMonitorService } from '@/platform/monitor/__tests__/mock-monitor';
import { MonitorService } from '@/platform/monitor/service';

beforeEach(() => {
    service = new CommandService(
        createMockMonitorService() as unknown as MonitorService,
    );
});
```

- 复用 `platform/monitor/__tests__/mock-monitor.ts` 的 `createMockMonitorService()`。
- 新增 mock helper 放到对应服务的 `__tests__/` 目录下。

---

## 决策树：该用哪种注入方式？

```
构造函数需要依赖？
├─ 是 → 依赖类型是 class？
│       ├─ 是 → 依赖关系是否构成循环？
│       │       ├─ 否 → @Inject(Class)                    ← 90% 的情况
│       │       └─ 是 → @Inject(Class) @Lazy()            ← 循环破解
│       └─ 否（interface / 抽象）→ @Inject('TOKEN')
│                 └─ 可能未注册？→ 再加 @Optional()
└─ 否 → 空构造函数
```

---

## 验证工具

容器提供调试 API：

```typescript
// 检查依赖图（register 后可见真实依赖）
container.getDependencyGraph();
// → { CommandService: ['MonitorService'], ... }

// 验证所有依赖可解析（缺失/循环会报错）
container.validate();
// → { valid: boolean, errors: string[] }

// 仅检测循环依赖
container.detectCircularDependencies();
// → ['A -> B -> A']
```

`bootstrap()` 启动时会自动调 `validate()`，依赖缺失或循环会直接抛异常阻止启动。

---

## 常见错误

| 错误信息 | 原因 | 解决 |
|----------|------|------|
| `Service "X" not registered` | 服务没加到 `bootstrap.ts` 的 register 列表 | 在 `createServiceContainer()` 中注册 |
| `Circular dependency detected: A -> B -> A` | 构造函数循环依赖 | 至少一边加 `@Lazy()` |
| `Reflect.defineMetadata is not a function` | `reflect-metadata` 未加载 | 确认从 `@/platform/di` import（会自动加载） |
| `Failed to resolve dependency "X" for service "Y"` | 依赖未注册 | 注册 X，或标 `@Optional()` |
| 测试中依赖是 `undefined` | esbuild 无 `design:paramtypes`，且参数没标 `@Inject` | 加 `@Inject(Class)` |

---

**最后更新**: 2026-07-01
