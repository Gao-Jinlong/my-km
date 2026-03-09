## Context

系统需要管理用户打开的项目文件夹和文件，当前存在的问题：
- 文件句柄无法持久化存储，刷新页面后丢失
- 缺少统一的资源释放机制，可能导致内存泄漏
- 没有面向对象的封装，代码分散

技术约束：
- 浏览器环境限制，需使用 File System Access API
- IndexedDB 是唯一的持久化存储方案
- 需遵循项目已有的 Disposable 模式

## Goals / Non-Goals

**Goals:**
- 实现文件句柄的 IndexedDB 持久化缓存
- 提供统一的文件服务 API，支持打开、读取、写入文件
- 集成 Disposable 模式进行资源生命周期管理
- 面向对象的模块化设计

**Non-Goals:**
- 不支持后端文件操作（纯浏览器环境）
- 不提供文件同步或版本控制功能
- 不处理大型文件的分块读写（由上层业务处理）

## Decisions

### 1. IndexedDB 封装方案
**决策**: 使用原生 IndexedDB API 配合 Promise 封装，不引入额外库
**理由**:
- 项目已有简单存储需求，无需完整 ORM
- 减少依赖，保持代码轻量
- 便于理解和维护

### 2. 文件句柄存储结构
**决策**: 使用项目 ID 作为 key，存储目录句柄；文件句柄使用相对路径作为 key
**理由**:
- 项目维度管理，便于批量清理
- 相对路径便于文件定位和管理

### 3. Disposable 集成方案
**决策**:
- `FileHandleCache` 继承 `Disposable` 抽象类
- `FileSystemService` 使用 `DisposableStore` 管理依赖服务
- `FileResourceManager` 作为单例，管理全局文件资源

**理由**: 遵循项目现有模式，保持代码一致性

### 4. 错误处理策略
**决策**:
- 封装标准错误类型（FileNotFoundError, PermissionDeniedError 等）
- 使用 TypeScript 类型系统明确错误边界
- 对外抛出明确错误，便于上层处理

## Risks / Trade-offs

**[风险]**: File System Access API 仅支持 Chromium 系浏览器
→ **缓解**: 在文档中明确浏览器兼容性，提供降级方案提示

**[风险]**: IndexedDB 存储配额限制（通常为磁盘空间的 10-60%）
→ **缓解**: 仅存储句柄引用，不存储文件内容；定期清理过期项目

**[风险]**: 文件句柄可能过期（用户删除文件或撤销权限）
→ **缓解**: 访问前验证句柄有效性，提供重新授权机制

**[风险]**: Disposable 模式依赖开发者正确使用
→ **缓解**: 提供 clear 文档和示例，在关键位置添加警告日志

## Migration Plan

1. 创建基础工具类（IndexedDB 封装）
2. 实现 FileHandleCache
3. 实现 FileSystemService
4. 实现 FileResourceManager
5. 导出统一 API
6. 编写使用文档和示例

无数据迁移风险，新增模块不影响现有功能。

## Open Questions

- 是否需要提供文件变更监听功能？（可通过后续扩展实现）
- 是否需要支持多项目同时打开？（设计已考虑，通过项目 ID 隔离）
