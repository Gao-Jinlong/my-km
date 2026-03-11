## Why

项目中需要一套类型安全、与 VSCode 事件 API 一致的事件机制，用于组件间通信和状态变化通知。目前在 `apps/web/src/base/common/` 中已有 `IDisposable` 接口和 `Disposable`基类，但缺少标准化的事件发布/订阅模式实现。

## What Changes

- 在 `apps/web/src/base/common/event.ts` 中新增事件模块
- 实现 `Event<T>` 函数类型和 `EventEmitter<T>` 类
- 提供 `MicrotaskEmitter<T>` 类支持微任务时机触发（可选）
- 提供配套的单元测试文件
- 导出相关类型：`Event`、`EventEmitter`、`MicrotaskEmitter`、`EmitterOptions`

## Capabilities

### New Capabilities

- `event-emitter`: 类型安全的事件发布/订阅机制，支持泛型事件数据、多订阅者、自动资源管理

### Modified Capabilities

- 无

## Impact

- **新增文件**: `apps/web/src/base/common/event.ts`
- **新增测试**: `apps/web/src/base/common/__tests__/event.test.ts`
- **导出变更**: `apps/web/src/base/common/index.ts` 需要导出新增的事件模块
- **依赖**: 依赖现有的 `lifecycle.ts` 中的 `IDisposable`、`Disposable`、`toDisposable`
