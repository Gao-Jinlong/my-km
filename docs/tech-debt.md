# 技术债务

> 记录已知的架构缺陷和待优化项，按模块分类。

---

## 文件树 (File Tree)

### FT-001: 文件操作后全量刷新目录树

**状态**: Open
**日期**: 2026-04-05
**文件**: `apps/web/src/components/workspace/sidebar/panels/file-tree.tsx`

**问题**: 当前文件操作（新建、重命名、删除）完成后，`refreshTree()` 会遍历所有已展开目录逐一重新加载子节点。对于深层嵌套或多目录展开的场景，这会产生不必要的 I/O 和渲染开销。

**当前行为**:
1. `clearStaleCache()` 清除受影响路径的缓存
2. `refreshTree()` 重新加载根目录 + **所有**已展开目录的子节点

**期望行为**: 只重新加载受影响的目录。例如：
- 在 `src/components/` 下新建文件，只需刷新 `src/components/` 的子节点
- 重命名文件只需刷新其父目录
- 删除目录只需刷新其父目录，并移除该目录及其子目录的缓存和展开状态

**建议方案**: `refreshTree` 接受 `affectedPaths: string[]` 参数，仅对这些路径执行 `listFiles` 并更新 `loadedChildren`，而非遍历全部 `expandedNodes`。

---

_新增条目请按 `模块-编号` 格式追加，保持状态（Open / In Progress / Resolved）和日期。_
