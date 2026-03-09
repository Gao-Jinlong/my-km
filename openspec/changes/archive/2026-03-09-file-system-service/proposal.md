## Why

当前系统缺少统一的文件管理能力，项目中打开的文件夹和文件缺乏持久化缓存和生命周期管理。这导致每次重新打开项目时需要重新选择文件，且无法有效管理文件资源的释放。本变更通过引入基于 IndexedDB 的文件句柄缓存和 Disposable 模式，实现高效、可靠的文件管理系统。

## What Changes

- 新增文件管理系统服务，用于统一管理项目中打开的文件夹和文件
- 使用 IndexedDB 缓存文件句柄，实现持久化存储和快速访问
- 集成现有的 Disposable 模式，统一资源释放逻辑
- 采用面向对象设计，提供清晰的文件系统 API

## Capabilities

### New Capabilities

- `file-handle-cache`: 基于 IndexedDB 的文件句柄缓存机制，支持存储和检索 FileSystemFileHandle 和 FileSystemDirectoryHandle
- `file-system-service`: 核心文件管理服务，提供打开、缓存、检索和管理文件/文件夹的完整 API
- `file-resource-manager`: 文件资源管理器，负责跟踪活动文件资源的生命周期，支持自动清理

### Modified Capabilities

<!-- 无修改的现有能力 -->

## Impact

- **依赖**: 项目已有的 `Disposable` 生命周期管理模式 (`apps/web/src/base/common/lifecycle.ts`)
- **浏览器 API**: 使用 File System Access API 和 IndexedDB API
- **影响范围**: 新增独立模块，不影响现有代码，位于 `apps/web/src/base/services/file-system/`
