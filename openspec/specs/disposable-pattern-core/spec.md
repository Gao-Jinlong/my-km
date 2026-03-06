## ADDED Requirements

### Requirement: IDisposable 接口定义

系统 SHALL 提供 `IDisposable` 接口作为所有可销毁资源的统一契约。接口定义如下：

```typescript
type IDisposable = {
    dispose(): void;
};
```

#### Scenario: 实现 IDisposable 接口的类
- **WHEN** 一个类实现 `IDisposable` 接口
- **THEN** 该类必须提供 `dispose()` 方法用于释放资源

### Requirement: Dispose 模式核心职责

Dispose 模式 SHALL 提供以下核心能力：
1. 统一资源清理接口
2. 批量资源管理
3. 错误隔离和处理
4. 生命周期状态追踪

#### Scenario: 使用 Dispose 模式管理事件监听器
- **WHEN** 组件注册了多个事件监听器
- **THEN** 组件销毁时可通过 `dispose()` 一次性移除所有监听器

### Requirement: 资源所有权

每个可销毁资源 SHALL 有明确的拥有者。拥有者负责：
1. 在适当时机调用资源的 `dispose()` 方法
2. 确保资源不会被重复销毁
3. 防止资源泄漏

#### Scenario: 组件拥有其子组件
- **WHEN** 父组件创建子组件
- **THEN** 父组件负责在销毁时调用子组件的 `dispose()` 方法

### Requirement: 代码示例 - 基本使用模式

系统 SHALL 提供以下基本使用示例：

```typescript
// 示例 1: 使用 DisposableStore 管理资源
const store = new DisposableStore();
const subscription = eventEmitter.on('data', handler);
store.add(subscription);
// 清理时
store.dispose();

// 示例 2: 继承 Disposable 类
class MyService extends Disposable {
    private timer: number;

    constructor() {
        super();
        this.timer = this._register(new DisposableTimer());
    }

    doWork() {
        // 使用资源
    }
}

// 示例 3: 使用 dispose 函数
dispose(singleDisposable);
dispose([disposable1, disposable2]);
dispose(undefined); // 安全处理
```
