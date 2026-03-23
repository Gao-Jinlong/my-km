## Why

当前系统缺少统一的文件管理能力，项目中打开的文件夹和文件缺乏持久化缓存和生命周期管理。这导致每次重新打开项目时需要重新选择文件，且无法有效管理文件资源的释放。本变更通过引入 Provider 模式的文件系统架构，实现高效、可靠、可扩展的文件管理系统。

## What Changes

- 新增基于 Provider 模式的文件系统服务，支持多种存储后端（内存、IndexedDB、原生文件访问）
- 使用协议路由机制（`memory://`, `idb://`, `file://`）统一路径解析
- 实现能力检查机制（Read/Write/List/Metadata），确保文件操作安全
- 集成现有的 Disposable 模式，统一资源释放逻辑
- 提供清晰的文件系统 API，支持打开、读取、写入、删除、列出目录等操作

## Capabilities

### New Capabilities

- `file-system-types`: 文件系统类型定义，包括路径、统计信息、能力枚举等
- `file-system-errors`: 文件系统错误码和错误类定义
- `file-system-provider-interface`: IFileSystemProvider 抽象接口定义
- `memory-provider`: 内存存储 Provider，用于测试和临时存储
- `indexed-db-provider`: IndexedDB 持久化存储 Provider
- `fs-access-provider`: File System Access API Provider，支持原生文件访问
- `file-system-service`: 核心文件服务，提供路径路由、能力检查、方法分发
- `uri`: URI 解析和序列化工具类

### Modified Capabilities

- `event-emitter`: 可能需要扩展以支持文件变更事件通知
- `lifecycle`: 可能需要扩展 Disposable 模式支持

## Impact

- **依赖**:
  - 项目已有的 `Disposable` 生命周期管理模式 (`apps/web/src/base/common/lifecycle.ts`)
  - 事件发射器 (`apps/web/src/base/common/event.ts`)
  - URI 模块（如需单独拆分）
- **浏览器 API**: 使用 File System Access API 和 IndexedDB API
- **影响范围**: 新增独立模块，位于 `apps/web/src/platform/file-system/`，不影响现有代码
- **浏览器兼容性**: File System Access API 仅在 Chromium 浏览器中可用，需提供 Fallback 方案
