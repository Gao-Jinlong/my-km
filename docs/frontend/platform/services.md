# Platform 服务层

前端的核心架构是一个类似 VS Code 的服务系统，通过自定义 DI 容器管理。

---

## DI 容器

**位置**: `platform/di/`

### 特性

- **构造函数类型自动注入**（NestJS 风格）：容器在 `register` 时读取 `design:paramtypes`，自动按构造函数参数类型解析依赖
- **`@Inject(token)` 显式覆盖**：用于注入字符串 token / interface（编译后类型信息丢失的场景）
- **`@Lazy()` 延迟代理**：破解构造函数循环依赖，首次属性访问时才解析实例
- **`@Optional()` 可选依赖**：未注册时注入 `undefined` 而非抛异常
- 单例 / 多实例支持
- 循环依赖检测（resolve 时 + `validate()` 静态扫描）
- 懒加载实例化

### 核心文件

| 文件 | 职责 |
|------|------|
| `platform/di/container.ts` | `ServiceContainer` 容器实现 |
| `platform/di/decorators.ts` | `@Service` / `@Inject` / `@Lazy` / `@Optional` 装饰器 |
| `platform/di/hooks.ts` | `useService()` React hook + `getService()` 非 hook 版本 |

### 注入方式

#### 1. 构造函数类型自动注入（推荐）

```typescript
@Service()
class FileOpenService extends ServiceBase {
    // 无需 @Inject —— 容器按参数类型自动注入
    constructor(
        fileService: FileSystemService,
        editorTabService: EditorTabService,
    ) {
        super();
    }
}
```

> **注意**：纯类型推断依赖 `emitDecoratorMetadata`。生产构建（Next.js/SWC）支持；
> vitest 默认使用 esbuild 不输出 `design:paramtypes`，测试中用 `@Inject(Class)` 保证一致性。

#### 2. `@Inject(token)` 显式指定

用于 interface 注入（类型编译后丢失）或字符串 token：

```typescript
@Service()
class MyService extends ServiceBase {
    constructor(
        monitorService: MonitorService,                    // 自动注入
        @Inject('LOGGER') logger: Logger,                  // interface，需显式 token
    ) {
        super();
    }
}
```

#### 3. `@Lazy()` 破解循环依赖

```typescript
@Service()
class ServiceA {
    constructor(@Lazy() b: ServiceB) {}  // 延迟解析
}
@Service()
class ServiceB {
    constructor(@Lazy() a: ServiceA) {}  // 延迟解析
}
```

### React 中使用服务

```typescript
'use client';
import { useService } from '@/platform/di';

function MyComponent() {
    const commandService = useService(CommandService);
    // ...
}
```

非组件代码用 `getService()` 或 `container.get(Class)`。

---

## 注册的服务

**位置**: `platform/bootstrap.ts`

注册顺序无关——容器在 `get()` 时按需实例化并自动解析依赖。

| 服务 | 职责 |
|------|------|
| `MonitorService` | 前端日志系统 |
| `FileSystemService` | 文件系统抽象，支持 File System Access API / IndexedDB / Memory 三种 provider |
| `ContextMenuService` | 右键菜单管理 |
| `DialogService` | 对话框服务 |
| `EditorContainer` | 编辑器容器，管理 Lexical 编辑器实例 |
| `DocumentStore` | 文档元数据存储 |
| `EditorTabService` | 编辑器标签页管理 |
| `FileOpenService` | 文件打开流程 |
| `EventBusService` | 跨服务事件总线 |
| `CommandService` | 命令注册与执行系统 |
| `MessageChannelService` | 消息通道 |
| `KeyboardShortcutService` | 快捷键管理 |
| `PanelService` | 工作区面板状态管理 |
| `ConditionalService` | 条件评估（快捷键/菜单的执行条件） |
| `TracingService` | 前端链路追踪：Span 创建、批量上报、traceparent 传播 |
| `DocumentExportService` | 文档导出（.km → Markdown/txt） |

---

## 基类

**位置**: `platform/base/service-base.ts`

- `ServiceBase` extends `Disposable`
- 提供统一的资源管理和生命周期（`_store` / `onDispose`）

---

## Dispose 模式

基于 VSCode 的资源生命周期管理模式：

### IDisposable 接口
```typescript
interface IDisposable {
  dispose(): void;
}
```

### DisposableStore
```typescript
const store = new DisposableStore();
store.add(subscription);
store.dispose(); // 一次性清理所有
```

### 使用方式
1. **使用 DisposableStore** - 资源容器，管理多个可销毁对象
2. **继承 Disposable 类** - 提供便捷继承的基类
3. **使用 dispose 函数** - 批量销毁资源的工具函数

---

## 相关文件

- [前端架构](../frontend/architecture.md) - 前端整体架构
- [Dispose 模式规范](../../openspec/changes/archive/2026-03-06-vscode-disposable-pattern-spec/)

---

**最后更新**: 2026-07-01
