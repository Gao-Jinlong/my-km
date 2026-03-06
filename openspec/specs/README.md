# Dispose 模式规范

基于 VSCode 的资源生命周期管理模式，用于统一处理可销毁资源的清理工作，防止内存泄漏。

## 核心概念

- **[IDisposable 接口](./disposable-pattern-core/spec.md)**: 所有可销毁资源的统一契约
- **[DisposableStore](./disposable-store-usage/spec.md)**: 资源容器，管理多个可销毁对象
- **[Disposable 基类](./disposable-base-class/spec.md)**: 提供便捷继承的基类
- **[dispose 函数](./dispose-function/spec.md)**: 批量销毁资源的工具函数

## 使用指南

### 何时使用

- 管理事件监听器和订阅
- 清理定时器（setTimeout/setInterval）
- 释放 DOM 引用和观察者
- 关闭网络连接和 WebSocket
- 其他需要显式释放的资源

### 基本用法

```typescript
// 方式 1: 使用 DisposableStore
const store = new DisposableStore();
const subscription = eventEmitter.on('data', handler);
store.add(subscription);
store.dispose(); // 一次性清理所有

// 方式 2: 继承 Disposable 类
class MyService extends Disposable {
    constructor() {
        super();
        this._register(eventEmitter.on('data', handler));
    }
}

// 方式 3: 使用 dispose 函数
dispose(singleDisposable);
dispose([disposable1, disposable2]);
```

## 最佳实践

- ✅ 始终在对象销毁时调用 `dispose()`
- ✅ 使用 `_register()` 注册所有子资源
- ✅ 重写 `dispose()` 时调用 `super.dispose()`
- ✅ 避免循环引用（不要将对象注册到自身）

## 反模式

- ❌ 忘记调用 `dispose()` 导致资源泄漏
- ❌ 在 `dispose()` 后继续使用对象
- ❌ 在 `dispose()` 方法中执行异步操作
- ❌ 向已销毁的 store 添加资源

## 详细规范

| 规范 | 说明 |
|------|------|
| [核心概念](./disposable-pattern-core/spec.md) | IDisposable 接口定义和核心职责 |
| [DisposableStore](./disposable-store-usage/spec.md) | 资源容器的使用规范 |
| [Disposable 基类](./disposable-base-class/spec.md) | 继承约定和使用方式 |
| [dispose 函数](./dispose-function/spec.md) | 工具函数行为定义 |
| [最佳实践](./lifecycle-best-practices/spec.md) | 使用场景和注意事项 |
| [反模式](./anti-patterns/spec.md) | 常见错误和避免方法 |

## 实现位置

- 源代码：`apps/web/src/base/common/lifecycle.ts`

---

归档日期：2026-03-06
归档位置：`openspec/changes/archive/2026-03-06-vscode-disposable-pattern-spec/`
