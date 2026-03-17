## 1. 核心实现

- [x] 1.1 在 `apps/web/src/base/common/event.ts` 中定义 `Event<T>` 类型
- [x] 1.2 实现 `EventEmitter<T>` 类，继承自 `Disposable`
- [x] 1.3 实现 `event` 方法（订阅功能）
- [x] 1.4 实现 `fire` 方法（事件触发）
- [x] 1.5 实现 `dispose` 方法清理资源

## 2. 导出配置

- [x] 2.1 在 `apps/web/src/base/common/index.ts` 中导出事件模块

## 3. 单元测试

- [x] 3.1 创建测试文件 `apps/web/src/base/common/__tests__/event.test.ts`
- [x] 3.2 编写 Event 类型订阅/取消订阅测试
- [x] 3.3 编写 EventEmitter 基础功能测试
- [x] 3.4 编写 fire 方法测试（包括多监听器、执行顺序）
- [x] 3.5 编写 dispose 资源清理测试
- [x] 3.6 编写类型安全测试（TypeScript 类型检查）

## 4. 验证

- [x] 4.1 运行单元测试，确保全部通过
- [x] 4.2 运行 TypeScript 编译检查，确保无类型错误
