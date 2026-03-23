## Why

文件系统架构需要统一的资源标识机制来支持多种存储后端（本地文件系统、IndexedDB 等）。URI 模块提供标准化的路径解析和序列化能力，是文件系统服务的核心依赖。

## What Changes

- 新增 URI 类，用于解析和序列化 `scheme://path` 格式的资源标识符
- 支持 `file://` 和 `idb://` 两种 scheme
- 提供不可变设计，URI 对象创建后不可修改
- 支持 JSON 序列化和反序列化，用于状态持久化

## Capabilities

### New Capabilities
- `uri-parser`: URI 字符串解析为结构化对象
- `uri-serialization`: URI 与 JSON/字符串之间的双向转换
- `uri-immutable`: 不可变 URI 设计及 `with` 方法创建新实例

### Modified Capabilities
<!-- 无修改的现有能力 -->

## Impact

- 依赖：无外部依赖，纯 TypeScript 实现
- 被依赖：文件系统服务、资源管理器
- 代码目录：`apps/web/src/base/common/uri/`
