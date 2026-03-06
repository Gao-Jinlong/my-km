## ADDED Requirements

### Requirement: Disposable 抽象基类

系统 SHALL 提供 `Disposable` 抽象基类，简化 `IDisposable` 的实现。基类 SHALL：
1. 内部持有一个 `DisposableStore` 实例
2. 提供 `_register()` 方法用于注册子资源
3. 实现 `dispose()` 方法委托给内部 store

```typescript
abstract class Disposable implements IDisposable {
    protected readonly _store = new DisposableStore();

    public dispose(): void {
        this._store.dispose();
    }

    protected _register<T extends IDisposable>(o: T): T {
        if ((o as unknown as Disposable) === this) {
            throw new Error('Cannot register a disposable on itself!');
        }
        return this._store.add(o);
    }
}
```

#### Scenario: 继承 Disposable 类
- **WHEN** 一个类继承 `Disposable` 基类
- **THEN** 该类自动获得 `dispose()` 方法和 `_register()` 方法

### Requirement: _register 方法使用约定

子类 SHALL 使用 `_register()` 方法注册所有需要生命周期管理的资源。

```typescript
class MyComponent extends Disposable {
    private subscription: Subscription;

    constructor() {
        super();
        this.subscription = this._register(new Subscription());
    }
}
```

#### Scenario: 在构造函数中注册资源
- **WHEN** 子类在构造函数中创建可销毁资源
- **THEN** 资源应当通过 `this._register()` 注册，自动由父类管理

### Requirement: Disposable 自注册保护

`Disposable._register()` SHALL 禁止注册自身，防止循环引用。

#### Scenario: 尝试注册自身
- **WHEN** 代码尝试调用 `disposable._register(disposable)`
- **THEN** 系统抛出错误 "Cannot register a disposable on itself!"

### Requirement: 代码示例 - Disposable 基类使用

```typescript
// 示例 1: 基础继承
class DataService extends Disposable {
    private data: Map<string, any> = new Map();

    getData(key: string) {
        return this.data.get(key);
    }
}

// 示例 2: 注册多个资源
class Editor extends Disposable {
    private model: TextModel;
    private view: EditorView;

    constructor() {
        super();
        this.model = this._register(new TextModel());
        this.view = this._register(new EditorView(this.model));

        // 也可以注册事件监听器
        this._register(this.model.onDidChange(() => this.updateView()));
    }
}

// 示例 3: 重写 dispose 方法
class ComplexComponent extends Disposable {
    private externalResource: ExternalResource;

    dispose(): void {
        // 先执行自定义清理逻辑
        this.externalResource?.release();
        // 再调用父类 dispose 清理内部 store
        super.dispose();
    }
}
```
