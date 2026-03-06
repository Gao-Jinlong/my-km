## Context

Dispose 模式是 VSCode 核心架构中的资源生命周期管理模式，用于系统化地管理和清理可销毁资源。该模式通过统一的接口和容器机制，确保对象在销毁时能够正确释放其持有的所有资源，防止内存泄漏。

**当前状态**:
- 已在 `apps/web/src/base/common/lifecycle.ts` 实现基础框架
- 包含 `IDisposable` 接口、`dispose` 函数、`DisposableStore` 类和 `Disposable` 抽象类
- 缺少完整的使用规范和最佳实践文档

**约束**:
- 保持现有 API 不变
- 遵循 TypeScript 类型系统
- 与 VSCode 原生实现保持兼容

## Goals / Non-Goals

**Goals:**
- 建立完整的 Dispose 模式 spec 文档
- 明确各组件的职责和使用场景
- 提供清晰的使用示例和最佳实践
- 防止内存泄漏和资源浪费

**Non-Goals:**
- 不修改现有 `lifecycle.ts` 实现
- 不引入新的外部依赖
- 不改变现有的接口签名

## Decisions

### 1. 模式结构设计

**决策**: 采用三层结构设计：
- `IDisposable` 接口：定义 `dispose()` 方法契约
- `DisposableStore`：资源容器，管理多个可销毁对象
- `Disposable` 抽象基类：提供便捷继承的基类

**理由**:
- 接口定义契约，容器管理集合，基类简化使用
- 符合单一职责原则
- 与 VSCode 原生实现保持一致

### 2. 错误处理机制

**决策**: `dispose()` 函数在遇到多个错误时抛出 `AggregateError`

**理由**:
- 确保所有资源都被尝试清理
- 调用者可以获知所有发生的错误
- 符合现代 JavaScript 错误处理标准

### 3. 自注册保护

**决策**: `DisposableStore.add()` 和 `Disposable._register()` 禁止注册自身

**理由**:
- 防止循环引用导致的无限递归
- 提前发现编程错误
- 提供清晰的错误信息

### 4. 已销毁后添加警告

**决策**: 向已销毁的 `DisposableStore` 添加资源时输出警告而非静默失败

**理由**:
- 帮助开发者发现潜在的资源泄漏
- 保持向后兼容性
- 可通过 `DISABLE_DISPOSED_WARNING` 关闭

## Risks / Trade-offs

| Risk | Mitigation |
|------|------------|
| 开发者忘记调用 `dispose()` 导致资源泄漏 | 提供 `Disposable` 基类简化使用，文档中强调生命周期管理 |
| 在已销毁的 store 上添加资源 | 运行时警告 + 控制台堆栈跟踪 |
| 循环引用导致栈溢出 | 自注册检查 + 清晰的错误信息 |
| 多个资源 dispose 时部分失败 | 使用 `AggregateError` 报告所有错误 |

## Migration Plan

1. 完成 spec 文档编写
2. 在团队内部分享和 review
3. 将文档纳入代码审查检查项
4. 定期检查现有代码是否遵循规范

## Open Questions

无
