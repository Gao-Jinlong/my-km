## ADDED Requirements

### Requirement: dispose 工具函数

系统 SHALL 提供 `dispose()` 工具函数，支持多种输入类型：
1. 单个 `IDisposable` 对象
2. `IDisposable` 数组
3. 可迭代的 `IDisposable` 集合
4. `undefined` 值（安全处理）

```typescript
function dispose<T extends IDisposable>(disposables: T | Iterable<T> | undefined): any
```

#### Scenario: 销毁单个对象
- **WHEN** 调用 `dispose(singleDisposable)`
- **THEN** 该对象的 `dispose()` 方法被调用

### Requirement: 批量销毁和错误收集

`dispose()` 函数在处理多个对象时 SHALL 收集所有异常，并根据错误数量采取不同策略：
1. 无错误：正常返回
2. 一个错误：抛出该错误
3. 多个错误：抛出 `AggregateError`

#### Scenario: 多个资源中一个抛出异常
- **WHEN** `dispose([obj1, obj2, obj3])` 中 `obj2.dispose()` 抛出异常
- **THEN** 函数抛出该单一异常，但 `obj3` 仍被销毁

### Requirement: AggregateError 处理

当多个资源的 `dispose()` 方法抛出异常时，`dispose()` 函数 SHALL 使用 `AggregateError` 包装所有错误。

```typescript
throw new AggregateError(errors, 'Multiple errors occurred');
```

#### Scenario: 多个资源同时抛出异常
- **WHEN** `dispose([obj1, obj2])` 中两者都抛出异常
- **THEN** 抛出 `AggregateError`，包含两个错误对象

### Requirement: 空操作处理

`dispose()` 函数 SHALL 安全处理 `undefined` 和空集合。

#### Scenario: 销毁 undefined
- **WHEN** 调用 `dispose(undefined)`
- **THEN** 函数不执行任何操作，正常返回

#### Scenario: 销毁空数组
- **WHEN** 调用 `dispose([])`
- **THEN** 函数不执行任何操作，返回空数组

### Requirement: 代码示例 - dispose 函数使用

```typescript
// 示例 1: 销毁单个对象
const single = new Subscription();
dispose(single);

// 示例 2: 销毁数组
const disposables = [sub1, sub2, sub3];
dispose(disposables);

// 示例 3: 安全处理 undefined
let optionalDisposable: IDisposable | undefined = getOptional();
dispose(optionalDisposable); // 安全，不会抛出错误

// 示例 4: 在 dispose 方法中使用
class MyComponent extends Disposable {
    private childStore: DisposableStore;

    dispose(): void {
        dispose(this.childStore);
        super.dispose();
    }
}
```
