## Why

本项目参考 VSCode 的 Dispose 模式设计了资源生命周期管理系统，用于统一处理可销毁资源的清理工作，防止内存泄漏。当前已在 `apps/web/src/base/common/lifecycle.ts` 中实现了基础框架，但缺少完整的 spec 文档来描述该模式的设计理念、使用规范和扩展方式。本文档旨在梳理 VSCode Dispose 模式的核心设计，为项目建立清晰的资源管理标准。

## What Changes

- **新增 spec 文档**: 完整描述 Dispose 模式的设计规范和使用指南
- **梳理核心概念**: 明确 `IDisposable`、`DisposableStore`、`Disposable` 的职责和使用场景
- **建立使用规范**: 定义何时使用 Dispose 模式、如何正确注册和管理资源
- **参考 VSCode 实践**: 总结 VSCode 在该模式上的最佳实践和注意事项

## Capabilities

### New Capabilities

- `disposable-pattern-core`: Dispose 模式的核心概念和架构设计
- `disposable-store-usage`: DisposableStore 的使用规范和内部管理机制
- `disposable-base-class`: Disposable 基类的使用方式和继承约定
- `dispose-function`: dispose 工具函数的行为和错误处理机制
- `lifecycle-best-practices`: Dispose 模式的最佳实践和常见陷阱

### Modified Capabilities

- (无)

## Impact

- 受影响组件：项目中所有需要管理资源生命周期的模块
- 依赖：无外部依赖变化
- 代码规范：建立统一的资源销毁和清理标准
- 文档：为后续开发提供 Dispose 模式的使用参考
