## ADDED Requirements

### Requirement: Event 类型定义
Event 是一个泛型函数类型，接受一个监听器函数并返回一个 IDisposable 用于取消订阅。

#### Scenario: 订阅事件
- **WHEN** 调用 `event(listener)` 传入一个符合签名的监听器
- **THEN** 返回一个 IDisposable 对象，调用其 dispose() 方法可取消订阅

### Requirement: EventEmitter 类定义
EventEmitter 是一个泛型类，继承自 Disposable，用于管理特定类型事件的发布和订阅。

#### Scenario: 创建 EventEmitter 实例
- **WHEN** 实例化 `new EventEmitter<T>()`
- **THEN** 创建一个可以发射类型 T 事件的 emitter 实例

#### Scenario: EventEmitter 继承 Disposable
- **WHEN** 调用 `emitter.dispose()`
- **THEN** emitter 被正确清理，所有订阅被移除

### Requirement: EventEmitter.event 属性
每个 EventEmitter 都有一个 `event` 属性，类型为 `Event<T>`，用于订阅事件。

#### Scenario: 订阅单个监听器
- **WHEN** 调用 `emitter.event(listener)`
- **THEN** 监听器被注册，当事件触发时被调用

#### Scenario: 订阅多个监听器
- **WHEN** 多次调用 `emitter.event()` 传入不同的监听器
- **THEN** 所有监听器都被注册，事件触发时按注册顺序依次调用

#### Scenario: 取消单个订阅
- **WHEN** 调用订阅返回的 `disposable.dispose()`
- **THEN** 对应的监听器被移除，不再接收事件

### Requirement: EventEmitter.fire 方法
fire 方法用于触发事件，将所有已注册的监听器以同步方式调用。

#### Scenario: 触发事件
- **WHEN** 调用 `emitter.fire(data)`
- **THEN** 所有已注册的监听器都被调用，并接收到正确的数据

#### Scenario: 无监听器时触发
- **WHEN** 调用 `emitter.fire(data)` 但没有任何订阅者
- **THEN** 不抛出异常，方法正常返回

#### Scenario: 监听器执行顺序
- **WHEN** 多个监听器被注册后触发事件
- **THEN** 监听器按注册顺序依次执行

### Requirement: 类型安全
EventEmitter 使用 TypeScript 泛型确保事件数据的类型安全。

#### Scenario: 泛型类型约束
- **WHEN** 定义 `EventEmitter<string>`
- **THEN** fire() 方法只接受 string 类型参数，类型错误时编译失败

#### Scenario: 监听器类型匹配
- **WHEN** 订阅事件的监听器参数类型与泛型 T 不匹配
- **THEN** TypeScript 编译时报错

### Requirement: 资源管理
EventEmitter 继承 Disposable 模式，确保资源正确释放。

#### Scenario: dispose 后不再触发监听器
- **WHEN** 调用 `emitter.dispose()` 后调用 `emitter.fire(data)`
- **THEN** 监听器不被调用（因为监听器数组已被清空）

#### Scenario: 订阅在 dispose 前已被取消
- **WHEN** 订阅返回的 disposable 被 dispose 后，再 dispose emitter
- **THEN** 不抛出异常，资源正确清理
