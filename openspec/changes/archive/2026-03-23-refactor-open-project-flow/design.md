## Context

当前文件系统服务 (`FileSystemService`) 已经实现，提供了基于 Provider 模式的文件系统抽象，支持 `memory://`, `idb://`, `file://` 三种协议。但缺少 UI 层的集成：

1. **无项目概念**: 用户无法通过界面选择并打开项目目录
2. **无欢迎页面**: 工作区加载后直接显示空状态，没有引导用户打开项目
3. **资源管理**: 缺少项目级别的生命周期管理，文件句柄缓存无法在关闭项目时释放

### 技术约束

- 使用 File System Access API (仅 Chromium 浏览器支持)
- 需要与现有的 `Disposable` 模式集成
- 需要与 `workspace-store` 状态管理集成
- 浏览器沙箱环境限制

## Goals / Non-Goals

**Goals:**

- 实现完整的项目打开流程（选择目录 → 注册 Provider → 显示文件树）
- 实现欢迎页面，在无项目时展示
- 实现项目状态管理（当前项目路径、打开状态）
- 项目切换时自动清理旧项目资源

**Non-Goals:**

- 项目持久化配置（如项目名称、自定义图标）
- 多项目同时打开（工作区）
- 项目同步/云端存储
- 历史项目列表（快速切换）

## Decisions

### 1. 项目表示方式

**Decision:** 使用 `file://` 协议的目录句柄作为项目标识

**Rationale:**
- 与 File System Access API 一致
- 可以直接复用 `fs-access-provider`
- 支持后续扩展到云端项目（使用不同 scheme）

**Alternatives Considered:**
- 使用本地路径字符串：无法跨平台，不支持沙箱
- 使用 UUID 标识：需要额外的映射表，增加复杂度

### 2. 项目管理器位置

**Decision:** 在 `platform/file-system` 模块内新增 `project-manager.ts`

**Rationale:**
- 项目管理本质是文件系统资源的生命周期管理
- 可以复用 `FileSystemService` 的单例
- 保持模块边界清晰

### 3. 项目状态存储

**Decision:** 使用 Zustand store 管理项目状态，集成到现有 `workspace-store`

**Rationale:**
- 与现有工作区状态管理一致
- 支持持久化到 localStorage
- React 组件可以直接订阅状态变化

### 4. 欢迎页面触发条件

**Decision:** 当 `workspace-store` 中无活跃项目时显示欢迎页

**Rationale:**
- 简单明确的状态判断
- 与现有 store 集成，无需新增状态源

## Risks / Trade-offs

| Risk | Mitigation |
|------|------------|
| File System Access API 兼容性 | 提供 Fallback UI 提示，引导用户使用支持的浏览器 |
| 项目句柄在刷新后丢失 | 使用 `indexed-db-provider` 持久化句柄 |
| 大目录性能问题 | 实现懒加载，仅展开时读取子目录 |
| 权限被拒绝 | 显示友好的错误提示，引导用户重新授权 |

## Migration Plan

1. 创建 `project-manager.ts` 和项目状态类型
2. 扩展 `workspace-store` 添加项目状态字段
3. 创建欢迎页面和项目选择器组件
4. 修改 `workspace/page.tsx` 根据项目状态路由
5. 集成测试和错误处理

## Open Questions

- 是否需要支持快速切换历史项目？
- 是否需要项目配置（如排除目录）？
