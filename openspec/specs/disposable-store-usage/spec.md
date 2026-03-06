## ADDED Requirements

### Requirement: DisposableStore 基本功能

`DisposableStore` SHALL 提供以下核心功能：
1. 添加可销毁对象到内部集合
2. 一次性销毁所有已注册的对象
3. 清空集合但不销毁自身
4. 防止向已销毁的 store 添加对象（警告）

#### Scenario: 添加和销毁多个资源
- **WHEN** 使用 `add()` 方法添加多个 `IDisposable` 对象
- **THEN** 调用 `dispose()` 时所有对象按顺序被销毁

### Requirement: DisposableStore 自注册保护

`DisposableStore` SHALL 禁止在自身上注册，防止循环引用。

```typescript
public add<T extends IDisposable>(o: T): T {
    if ((o as unknown as DisposableStore) === this) {
        throw new Error('Cannot register a disposable on itself!');
    }
    // ...
}
```

#### Scenario: 尝试注册自身
- **WHEN** 代码尝试调用 `store.add(store)`
- **THEN** 系统抛出错误 "Cannot register a disposable on itself!"

### Requirement: 已销毁状态检查

`DisposableStore` SHALL 追踪自身的销毁状态，并在已销毁后尝试添加新资源时输出警告。

#### Scenario: 向已销毁的 store 添加资源
- **WHEN** `store.dispose()` 被调用后再次调用 `store.add(disposable)`
- **THEN** 系统输出警告堆栈跟踪，但资源仍被丢弃（不添加到集合）

### Requirement: 异常安全

`DisposableStore.clear()` SHALL 确保即使某个资源的 `dispose()` 抛出异常，后续资源仍会被尝试清理。

#### Scenario: 某个资源 dispose 抛出异常
- **WHEN** 集合中某个对象的 `dispose()` 方法抛出异常
- **THEN** 其他对象仍会被清理，异常被收集后统一处理

### Requirement: 代码示例 - DisposableStore 使用

```typescript
// 示例 1: 基本使用
const store = new DisposableStore();
const sub1 = eventEmitter.on('event1', handler1);
const sub2 = eventEmitter.on('event2', handler2);
store.add(sub1);
store.add(sub2);
// 一次性清理所有
store.dispose();

// 示例 2: 链式添加
const timer = store.add(new Timer(1000));

// 示例 3: 清空但不销毁
store.clear(); // 清理所有资源，但 store 仍可继续使用

// 示例 4: 在类中使用
class MyComponent {
    private store = new DisposableStore();

    init() {
        this.store.add(eventEmitter.on('data', this.handleData));
    }

    destroy() {
        this.store.dispose();
    }
}
```
