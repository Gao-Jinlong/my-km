## ADDED Requirements

### Requirement: 反模式 - 忘记调用 dispose

开发者不应当在创建 Disposable 对象后忘记调用 `dispose()` 方法。

```typescript
// ❌ 错误：资源泄漏
class MyComponent extends Disposable {
    // 忘记实现 dispose 方法或忘记调用
}

// ✅ 正确：确保调用 dispose
class MyComponent extends Disposable {
    dispose(): void {
        super.dispose(); // 必须调用
    }
}
```

#### Scenario: React 组件忘记清理
- **WHEN** React 组件在 useEffect 中创建 Disposable 但未返回清理函数
- **THEN** 会导致资源泄漏，应当使用 useEffect 的返回函数调用 dispose

### Requirement: 反模式 - 在 dispose 后继续使用对象

开发者不应当在对象被 dispose 后继续使用它。

```typescript
// ❌ 错误：dispose 后继续使用
const store = new DisposableStore();
store.add(subscription);
store.dispose();
store.add(anotherSubscription); // 警告：向已销毁的 store 添加资源

// ✅ 正确：dispose 后不再使用
const store = new DisposableStore();
store.add(subscription);
store.dispose();
// 不再使用 store
```

#### Scenario: 访问已销毁的资源
- **WHEN** 代码在 dispose 后尝试使用资源
- **THEN** 可能导致未定义行为或错误

### Requirement: 反模式 - 循环引用

开发者不应当创建循环引用，将对象注册到自身。

```typescript
// ❌ 错误：循环引用
class MyService extends Disposable {
    constructor() {
        super();
        this._register(this); // 抛出错误！
    }
}

// ❌ 错误：Store 自注册
const store = new DisposableStore();
store.add(store); // 抛出错误！

// ✅ 正确：注册其他对象
const store = new DisposableStore();
const subscription = eventEmitter.on('data', handler);
store.add(subscription);
```

#### Scenario: 尝试自注册
- **WHEN** 代码尝试将对象注册到自身
- **THEN** 系统应当抛出 "Cannot register a disposable on itself!" 错误

### Requirement: 反模式 - 忘记调用 super.dispose

开发者在重写 dispose 方法时，不应当忘记调用 `super.dispose()`。

```typescript
// ❌ 错误：忘记调用 super.dispose()
class MyComponent extends Disposable {
    private resource: SomeResource;

    dispose(): void {
        this.resource.cleanup();
        // 忘记调用 super.dispose() - 内部 store 未被清理！
    }
}

// ✅ 正确：调用 super.dispose()
class MyComponent extends Disposable {
    private resource: SomeResource;

    dispose(): void {
        this.resource.cleanup();
        super.dispose(); // 清理内部 store 中注册的资源
    }
}
```

#### Scenario: 重写 dispose 忘记 super
- **WHEN** 子类重写 dispose 但未调用 super.dispose()
- **THEN** 内部 store 中的资源不会被清理，导致资源泄漏

### Requirement: 反模式 - 在 dispose 中执行异步操作

开发者不应当在 dispose 方法中直接执行异步操作。

```typescript
// ❌ 错误：dispose 返回 Promise
class MyComponent extends Disposable {
    async dispose(): Promise<void> { // dispose 不应当是异步的
        await this.httpClient.close();
        super.dispose();
    }
}

// ✅ 正确：同步 dispose，异步操作在内部处理
class MyComponent extends Disposable {
    dispose(): void {
        // 触发异步操作的取消，但不等待完成
        this.abortController.abort();
        super.dispose();
    }
}
```

#### Scenario: 异步 dispose
- **WHEN** dispose 方法被声明为 async
- **THEN** 调用者可能不会 await，导致不可预测的行为

### Requirement: 反模式 - 向已销毁的 Store 添加资源

开发者不应当在 DisposableStore 被销毁后继续向其添加资源。

```typescript
// ❌ 错误：向已销毁的 store 添加资源
const store = new DisposableStore();
store.dispose();
const sub = eventEmitter.on('data', handler);
store.add(sub); // 警告：资源会被丢弃，造成泄漏

// ✅ 正确：在使用前检查状态或使用新的 store
const store = new DisposableStore();
const sub = eventEmitter.on('data', handler);
store.add(sub);
store.dispose();
// 需要时创建新的 store
const newStore = new DisposableStore();
```

#### Scenario: 向已销毁 store 添加资源
- **WHEN** 在 dispose 后调用 add()
- **THEN** 系统输出警告，资源被丢弃，造成潜在泄漏
