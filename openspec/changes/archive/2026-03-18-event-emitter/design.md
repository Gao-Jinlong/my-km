## Context

项目中已有完整的 Disposable 模式实现（`lifecycle.ts`），包括 `IDisposable`接口、`DisposableStore` 和 `Disposable` 基类。现在需要在此基础上实现 VSCode 风格的事件系统，这是 VSCode 核心架构模式之一。

**约束条件：**
- 保持与 VSCode 事件 API 接口一致
- 复用现有的 Disposable 模式
- 类型安全（使用 TypeScript 泛型）
- 不需要异步/微任务等高级特性（简化版本）

**相关方：**
- 所有需要使用事件通信的模块
- 依赖 `base/common` 的上层应用

## Goals / Non-Goals

**Goals:**
- 实现 `Event<T>` 函数类型，兼容 VSCode 的监听器签名
- 实现 `EventEmitter<T>`类，继承自`Disposable`
- 支持泛型事件数据类型
- 支持多个订阅者同时监听同一事件
- 订阅返回 `IDisposable` 用于取消订阅
- 提供 `fire(data: T)` 方法触发事件
- 提供完整的单元测试覆盖

**Non-Goals:**
- 不支持异步事件触发（微任务队列）
- 不支持事件优先级
- 不支持事件过滤/转换（map、filter 等操作符）
- 不支持一次性监听器快捷方法（可作为后续扩展）

## Decisions

### 1. Event 类型定义

**决策：** 采用 VSCode 标准的函数签名
```typescript
export type Event<T> = (listener: (e: T) => void) => IDisposable;
```

**理由：**
- 与 VSCode 完全兼容，便于未来迁移或扩展
- 函数式 API 简洁直观
- 返回值 `IDisposable`与现有生命周期管理一致

### 2. EventEmitter 结构设计

**决策：**
- `EventEmitter<T>` 继承自 `Disposable`
- 内部使用数组存储监听器
- `fire()`方法同步遍历执行所有监听器

**理由：**
- 继承 `Disposable` 可自动管理资源，在 dispose 时清理所有监听器
- 数组结构简单高效，适合常见的使用场景
- 同步执行符合大多数业务场景的预期

### 3. 监听器调用时机

**决策：** `fire()` 时直接同步调用，不创建事件副本

**理由：**
- VSCode 基础版本也是同步调用
- 简化实现，避免不必要的性能开销
- 注意：监听器中不应修改事件数据或添加/移除监听器

### 4. 错误处理策略

**决策：** 监听器抛出的异常不捕获，直接向上抛出

**理由：**
- 与 VSCode 行为一致
- 让调用者意识到错误来源
- 避免隐藏潜在的 bug

## Risks / Trade-offs

**[Risk] 监听器修改事件数据** → 如果事件数据是引用类型，监听器可能意外修改数据
→ **Mitigation:** 文档中说明，对于复杂对象建议使用不可变数据结构或深拷贝

**[Risk] 监听器中注册/卸载监听器** → 在事件回调中调用 `event()` 或 `dispose()` 可能导致数组遍历时的问题
→ **Mitigation:** 简化版本暂不处理，依赖使用者避免此类模式；未来可用副本数组或延迟队列解决

**[Trade-off]** 使用数组而非链表存储监听器
→ 优点：实现简单，遍历快；缺点：中间移除监听器需要数组移位
→ 可接受，因为常见场景是 dispose 时一次性清理
