## ADDED Requirements

### Requirement: 何时使用 Dispose 模式

Dispose 模式 SHALL 用于以下场景：
1. 管理事件监听器和订阅
2. 清理定时器（setTimeout/setInterval）
3. 释放 DOM 引用和观察者
4. 关闭网络连接和 WebSocket
5. 清理其他需要显式释放的资源

#### Scenario: 组件使用事件监听器
- **WHEN** 组件订阅了事件源
- **THEN** 组件 SHALL 继承 `Disposable` 并通过 `_register()` 注册事件订阅

### Requirement: 继承 Disposable 的时机

类 SHALL 在以下情况继承 `Disposable`：
1. 需要持有一个或多个可销毁资源
2. 有明确的生命周期（创建/销毁）
3. 需要被其他对象通过 `DisposableStore` 管理

#### Scenario: 创建有生命周期的服务类
- **WHEN** 创建一个需要管理多个订阅的服务类
- **THEN** 该类应当继承 `Disposable`，在销毁时自动清理所有资源

### Requirement: 避免的常见错误

开发者 SHALL 避免以下常见错误：

1. **忘记调用 super.dispose()**
   - 当重写 `dispose()` 方法时，必须调用 `super.dispose()`

2. **在 dispose 后继续使用资源**
   - `dispose()` 后对象进入未定义状态

3. **循环引用**
   - 不要将对象注册到自身

#### Scenario: 重写 dispose 方法
- **WHEN** 子类需要额外的清理逻辑
- **THEN** 先执行自定义清理，再调用 `super.dispose()`

### Requirement: 资源泄漏检测

系统 SHALL 提供以下机制帮助检测资源泄漏：

1. `DisposableStore.DISABLE_DISPOSED_WARNING` 静态属性控制警告输出
2. 向已销毁 store 添加资源时输出堆栈跟踪

#### Scenario: 调试资源泄漏
- **WHEN** 开发环境检测到向已销毁 store 添加资源
- **THEN** 控制台输出警告和堆栈跟踪，帮助定位泄漏源

### Requirement: 与 async 代码配合

使用 Dispose 模式时 SHALL 注意：
1. `dispose()` 方法是同步的，不应当返回 Promise
2. 异步资源清理应当在内部处理，`dispose()` 只触发清理
3. 长时间运行的异步操作应当支持取消

#### Scenario: 清理异步操作
- **WHEN** 组件有进行中的异步操作
- **THEN** `dispose()` 应当触发取消机制，但操作本身在后台完成
