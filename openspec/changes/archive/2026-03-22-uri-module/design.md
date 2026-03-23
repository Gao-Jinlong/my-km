## Context

URI 模块是文件系统架构的基础组件，参考 VSCode 的 [vscode-uri](https://github.com/microsoft/vscode-uri) 设计。需要支持多种存储后端（本地文件系统、IndexedDB）的统一资源标识。

**设计约束**:
- 不可变设计：URI 对象创建后不可修改
- 支持 JSON 序列化：用于状态持久化和跨系统传递
- 零外部依赖：纯 TypeScript 实现

## Goals / Non-Goals

**Goals:**
- 实现 URI 解析和序列化核心功能
- 支持 `file://` 和 `idb://` scheme
- 提供类型安全的 API
- 与 TypeScript 项目结构集成

**Non-Goals:**
- URL 编码/解码细节处理（使用内置 API）
- 网络请求功能
- 复杂 URI 验证规则

## Decisions

### 1. 类设计：使用 class 而非 interface

**选择**: 使用 ES6 class 实现 URI

**理由**:
- 支持实例方法（`toString()`, `toJSON()`, `with()`）
- 支持类型守卫（`URI.isUri()`）
- 更好的 IDE 支持和自动补全

**备选**: 使用纯对象 + 工具函数
- 缺点：无法封装行为，类型守卫复杂

### 2. 不可变性实现

**选择**: 只读属性 + `with()` 方法返回新实例

**理由**:
- 符合函数式编程原则
- 避免意外修改导致的状态问题
- 便于调试和状态追踪

### 3. 文件结构

```
apps/web/src/base/common/uri/
├── index.ts       # 模块入口，导出 URI 类
├── uri.ts         # URI 类实现
└── types.ts       # UriJson 类型定义
```

**理由**: 遵循项目现有模块组织模式（参考 event-emitter 模块）

## Risks / Trade-offs

| Risk | Mitigation |
|------|------------|
| URI 解析边界情况（特殊字符、编码问题） | 使用内置 `encodeURI/decodeURI`，添加充分测试 |
| 与现有代码集成问题 | 提供 `URI.isUri()` 类型守卫，渐进式迁移 |
| 性能开销（频繁创建/销毁） | 不可变对象，GC 友好；可考虑缓存常用 URI |
