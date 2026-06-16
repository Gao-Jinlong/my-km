# LLM 对话协议重构 — 执行进度与跟进清单

> 最后更新: 2026-06-16
> 分支: `feat/llm-protocol-p3-cross-replica`
> 上游设计: `docs/superpowers/specs/2026-06-15-llm-conversation-protocol-design.md`
> P1 计划: `docs/superpowers/plans/2026-06-15-llm-conversation-protocol-p1-authoritative-source.md`
> P2 计划: `docs/superpowers/plans/2026-06-16-llm-protocol-p2-eventbus.md`
> P2-4 计划: `docs/superpowers/plans/2026-06-16-llm-protocol-p2-4-stop.md`
> P2-5 计划: `docs/superpowers/plans/2026-06-16-llm-protocol-p2-5-frontend-connection.md`
> P3 计划: `docs/superpowers/plans/2026-06-16-llm-protocol-p3-cross-replica-signals.md`
> P4 计划: `docs/superpowers/plans/2026-06-16-llm-protocol-p4-frontend-atomization.md`

---

## 总览

LLM 对话协议重构分 5 个阶段（P1-P5），当前 P1/P2/P2-4/P2-5/P3 全部完成，P4 计划已创建。

| 阶段 | 内容 | 依赖 Redis | 状态 |
|------|------|-----------|------|
| **P1** 权威源迁移 | run 状态/事件落 PG，acquireLease，进程外 resume | 否 | ✅ 全部完成（11/11 Tasks） |
| **P2** 重连 | joinStream + 回放 + Redis EventBus，前端连接态状态机 | 是 | ✅ 全部完成 |
| **P2-4** stop 统一 | 前端 stop 不 abort fetch，取消有终态 | 否 | ✅ 全部完成 |
| **P2-5** 前端连接态 | 6 态状态机，paused 相位，heartbeat 断租 | 否 | ✅ 全部完成 |
| **P3** 跨副本信号 | SSE 解耦为 RunEventSink，跨副本 cancel/interrupt control channel | 否 | ✅ 全部完成 |
| **P4** 前端 runtime | 6 atom 拆分，tool_status 工具卡片，openThread 融合 | 否 | 📋 计划已创建，待启动 |
| **P5** 文档安全 | user 隔离，metrics，失真文档 | 否 | 🟡 文档清理已完成，user 隔离/metrics 待做 |

---

## 已完成的工作

### A. P1 权威源迁移（100% 完成）

P1 全部 11 个任务已完成——PG 权威读写层、租约机制、RunManager 委托重构、RunRecord seq 锚定、进程外 resume、并发控制、heartbeat 全量测试通过。

| Task | 内容 | 提交 |
|------|------|------|
| 1 | Prisma schema 迁移（Run 新字段 + RunEvent unique） | `11741c0` |
| 2 | REPLICA_ID token + LeaseResult 类型 | `8665958` |
| 3 | RunStateRepository 基础查询 | `323eedb` |
| 4 | acquireLease 乐观租约 | `ec0a0a7` (+`dafcd94`) |
| 5 | releaseLease + heartbeat | `02ecc3a` (+`577dc26`) |
| 6 | RunManager 委托 PG（+ updateTokenUsage） | `8662bc2` (+`f6ab9d0`) |
| 7 | RunRecord lastSeq 锚定 | `655a66a` (+`0f77e35`, `a5475ed`) |
| 8 | `resumeFromCommand` 进程外 resume | 已完成 |
| 9 | `startRun` 并发控制适配 | 已完成 |
| 10 | `executeRunProtocol` heartbeat + 终态释放租约 | 已完成 |
| 11 | 全量测试 + 构建 | 已完成（40 tests passed） |

### B. P2 EventBus + JoinStream（100% 完成）

- ✅ EventBus 抽象接口 + InProcess 降级实现
- ✅ joinStream 端点（回放 PG + 续 EventBus 实时，seq 去重衔接）
- ✅ RedisEventBus 实现（`AI_EVENT_BUS=redis` 开关）
- ✅ 全量测试（25 tests passed）

### C. P2-4 stop 统一（100% 完成）

- ✅ 前端 `stop()` 只调 cancel 不 abort fetch
- ✅ 后端 cancel 返回 owner 标识区分 204/202
- ✅ 取消有终态（`end {finish_reason:'cancelled'}`）

### D. P2-5 前端连接态（100% 完成）

- ✅ 6 态状态机（idle/loading/ready/streaming/paused/reconnecting）
- ✅ heartbeat 断租自动 abort
- ✅ `connectionPhase` + `lastSeq` 扁平化 snapshot
- ✅ paused 相位（保留 auto-dispatch）

### E. P3 跨副本信号 + SSE 解耦（100% 完成）

- ✅ `RunEventSink` 注册模式（SSE 写入三路解耦）
- ✅ `run:{runId}:control` channel 控制信号
- ✅ `subscribeControlChannel` + `sourceReplicaId` 排重
- ✅ 非 owner cancel 返回 202 Accepted
- ✅ 跨副本 interrupt signal（multitask_strategy）
- ✅ 全量测试（90 + 22 + 40 = 152 tests passed）

### B. 文档清理（P5 并行，已完成）

删除 5 篇描述已废弃架构（Socket.io/Orchestrator/WorkflowExecutor）的失真文档，6 处导航断链统一指向 spec。

| 提交 | 内容 |
|------|------|
| `9a20615` | 删除 ai-conversation-flow / ai-backend-architecture / ai-architecture-v2 / llm-integration-guide / frontend-chat-refactor-plan，修复断链 |

### C. 工具卡片设计（P4 设计前置，已完成）

design-first 治理要求视觉变更先在 `.pen` 体现。工具卡片的三态设计稿 + 实现规格已就绪。

| 提交 | 内容 |
|------|------|
| `2c1f5ad` | `.pen` 新增 Tool Call Card Pattern（三态+展开态）+ agent-guide.md 新增「编辑 .pen 布局规范」章节 |
| `32fdeeb` | 工具卡片实现 spec（组件 API / token 映射 / 数据集成点 / 验收标准） |

**设计稿位置**：`design-system.pen` → `03 Product Patterns` → "Tool Call Card Pattern"

---

## 待跟进：P4 前端 runtime（计划已创建，待启动）

> P4 是当前唯一剩余的协议重构阶段，优先级最高。依赖已全部就绪（P1-P3 后端支持已完成）。

| Task | 内容 | 关键文件 | 状态 |
|------|------|---------|------|
| **1** | 6 Atom 拆分（messages / connection / error / threadMeta / runState / interruptState） | `chat-runtime.ts`, `types.ts` | ⬜ 待做 |
| **2** | interrupt 派生重写（删除 Set，tool_status 派生） | `chat-runtime.ts`, `message-projection.ts` | ⬜ 待做 |
| **3** | `use-langgraph-stream` selector 接入 | `use-langgraph-stream.ts` | ⬜ 待做 |
| **4** | 工具卡片 UI（paused 态渲染，确认 / 取消按钮） | `message-bubble.tsx`, `tool-call-card.tsx` | ⬜ 待做 |
| **5** | openThread 融合 joinStream（统一入口） | `chat-runtime.ts` | ⬜ 待做 |
| **6** | 回归测试 + 文档更新 | — | ⬜ 待做 |

详见 P4 计划文档 `docs/superpowers/plans/2026-06-16-llm-protocol-p4-frontend-atomization.md`。

**前置依赖已就绪：**
- ✅ 后端 cancel / interrupt 控制信号（P3）
- ✅ frontend connectionPhase 6 态（P2-5）
- ✅ stop 统一语义（P2-4）
- ✅ 工具卡片设计稿（P4 设计前置，已完成）

---

## 待跟进：P5 文档安全（部分完成）

- [x] ~~删除 5 篇失真文档 + 修复断链~~（`9a20615`）
- [ ] **user 隔离 — 控制器层**（可立即并行）：`threads.controller.ts` / `runs.controller.ts` 加 `@UseGuards(JwtAuthGuard)` + `@CurrentUser('id')`；`thread.service.ts` 的 `findAll` 修复忽略 `opts.userId` 的 bug
- [ ] **user 隔离 — service 层串接**：`StartRunOpts` / `createRun` / `RunRecordOpts` 加 userId
- [ ] metrics（ai.ttfb_ms / token_rate / run_duration_ms / reconnect_count / lease_acquire_ms）

---

## 可立即并行的任务（零文件重叠）

以下任务与 P4 代码（chat-runtime.ts / use-langgraph-stream.ts / message-bubble.tsx）无文件冲突，可立即启动独立分支：

1. **P5 user 隔离控制器层** — 修真实安全缺陷，仅改 controller + thread.service
2. **P5 metrics 埋点** — 仅新增装饰器 / interceptor，不改动核心业务逻辑
3. **P4 feedback token 接入 Tailwind** — 仅改 `tailwind-preset.ts` + `globals.css`

---

## 环境备忘

- **Pencil MCP 连接**：需 VS Code Insiders 里安装 Pencil 扩展并打开 `.pen` 文件激活。桌面 Pencil app 与 ZCode 的 MCP 配置不匹配（配置指向 VS Code Insiders 扩展）。
- **`.pen` 编辑规范**：见 `docs/design-system/agent-guide.md`「编辑 .pen 设计稿的布局规范」章节——全程 flex 嵌套，禁用 `layout:"none"` 手写坐标。
- **fnm 环境**：commit 前需加载 node 环境（`fnm env --shell cmd`），husky pre-commit 依赖 npx。
