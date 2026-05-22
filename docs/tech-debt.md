# 技术债务

> 记录已知的架构缺陷和待优化项，按模块分类。

---

## AI 后端

### AI-001: 限流消息未写入对话历史

**状态**: Open
**日期**: 2026-05-22
**文件**: `apps/server/src/ai/dispatch/request-dispatcher.ts:46`

**问题**: 当请求被速率限制时，错误信息仅通过 WebSocket 推送给前端，未写入对话历史。用户在查看历史时看不到被限流的消息。

**建议方案**: 让 LLM 生成限流感知消息并写入对话历史，而非仅推送错误事件。

### AI-002: RoomService 待接入 auth 后改造

**状态**: Open
**日期**: 2026-05-22
**文件**: `apps/server/src/ai/conversation/room.service.ts:51`

**问题**: `RoomService` 当前方法签名未绑定用户上下文，待 auth 模块接入后需改为 `findByUserId` 模式。

---

## 前端

### FE-001: 废弃类型未清理

**状态**: Open
**日期**: 2026-05-22
**文件**: `apps/web/src/features/ai/types/ai.types.ts`

**问题**: 存在两个 `@deprecated` 类型定义（旧版 EditorContext 和 ServerMessage），新类型已存在但未清理旧定义。

**建议方案**: 找到所有引用点，替换为新类型后删除废弃定义。

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

## 已解决

### ✅ RES-001: AI 后端 MVP 重构

**状态**: Resolved
**日期**: 2026-05-19
**描述**: 从单类 `AiService` (343 行) 重构为分层架构 (gateway → dispatch → workflow → LLM provider)。
所有 Phase 1-4 已完成。详见 [backend/ai-architecture-v2.md](./backend/ai-architecture-v2.md)。

### ✅ RES-002: LangGraph 包合并

**状态**: Resolved
**日期**: 2026-05-14
**描述**: 将 `packages/langgraph-workflows/` 合并到 `apps/server/src/ai/langgraph/`，消除了独立包的维护开销和构建步骤。

### ✅ RES-003: WebSocket 客户端 Disposable 重构

**状态**: Resolved
**日期**: 2026-05-14
**描述**: WS 客户端重构为 Disposable 模式，资源生命周期管理规范化。详见 [plans/ws-client-disposable-refactor-plan.md](./plans/ws-client-disposable-refactor-plan.md)。

### ✅ RES-004: Room/Conversation 命名统一

**状态**: Resolved
**日期**: 2026-05-18
**描述**: 全栈 `conversation` 重命名为 `room`，消除命名歧义。

### ✅ RES-005: WS 信封格式解耦

**状态**: Resolved
**日期**: 2026-05-18
**描述**: WsGateway 与 MessageBus 解耦，引入统一信封格式 `{ type: 'message', payload: { ... } }`。

---

_新增条目请按 `模块-编号` 格式追加，保持状态（Open / In Progress / Resolved）和日期。_
