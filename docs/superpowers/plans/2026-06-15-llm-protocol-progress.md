# LLM 对话协议重构 — 执行进度与跟进清单

> 最后更新: 2026-06-15
> 分支: `feat/llm-protocol-p1-authoritative-source`
> 上游设计: `docs/superpowers/specs/2026-06-15-llm-conversation-protocol-design.md`
> P1 计划: `docs/superpowers/plans/2026-06-15-llm-conversation-protocol-p1-authoritative-source.md`

---

## 总览

LLM 对话协议重构分 5 个阶段（P1-P5），当前 P1 核心进行中，同时并行完成了两条独立任务（文档清理、工具卡片设计）。

| 阶段 | 内容 | 依赖 Redis | 状态 |
|------|------|-----------|------|
| **P1** 权威源迁移 | run 状态/事件落 PG，acquireLease，进程外 resume | 否 | 🔵 进行中（Task 1-7 完成，8-11 待做） |
| **P2** 重连 | joinStream + 回放 + Redis EventBus，前端连接态状态机 | 是 | ⬜ 未启动 |
| **P3** 协议清理 | SSE 写入解耦，stop 统一，messages 序列化，enqueue/rollback | 否 | ⬜ 未启动 |
| **P4** 前端 runtime | atom 化 snapshot，tool_status 工具卡片，openThread 融合 | 否 | 🟡 设计稿 + spec 就绪，代码待 P1/P3 |
| **P5** 文档安全 | user 隔离，metrics，失真文档 | 否 | 🟡 文档清理已完成，user 隔离/metrics 待做 |

---

## 已完成的工作

### A. P1 权威源迁移（Task 1-7 / 11）

P1 的基础设施层已完成——PG 权威读写层、租约机制、RunManager 委托重构、RunRecord seq 锚定。

| Task | 内容 | 提交 |
|------|------|------|
| 1 | Prisma schema 迁移（Run 新字段 + RunEvent unique） | `11741c0` |
| 2 | REPLICA_ID token + LeaseResult 类型 | `8665958` |
| 3 | RunStateRepository 基础查询 | `323eedb` |
| 4 | acquireLease 乐观租约 | `ec0a0a7` (+`dafcd94`) |
| 5 | releaseLease + heartbeat | `02ecc3a` (+`577dc26`) |
| 6 | RunManager 委托 PG（+ updateTokenUsage） | `8662bc2` (+`f6ab9d0`) |
| 7 | RunRecord lastSeq 锚定 | `655a66a` (+`0f77e35`, `a5475ed`) |

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

## 待跟进：P1 剩余（Task 8-11）

> 阻塞 P1 完成，优先级最高。

| Task | 内容 | 关键文件 | 状态 |
|------|------|---------|------|
| **8** | `resumeFromCommand` 进程外 resume（查 PG → acquireLease → 重建 RunRecord → adoptRun） | `ai.service.ts`, `ai.service.spec.ts` | ⬜ 待做 |
| **9** | `startRun` 并发控制适配（查 PG RunRow + replicaId；跨副本 interrupt 退化为 reject+warn） | `ai.service.ts`, `ai.service.spec.ts` | ⬜ 待做 |
| **10** | `executeRunProtocol` heartbeat + lastSeq 回写 + 终态释放租约 | `ai.service.ts`, `ai.service.spec.ts` | ⬜ 待做 |
| **11** | `AiModule` 注册 RunStateRepository + REPLICA_ID + 全量测试 + 构建 | `ai.module.ts` | ⬜ 待做 |

详见 P1 计划文档 Task 8-11 的逐步骤规格。

---

## 待跟进：P2-P5 各阶段

### P2 重连（未启动，依赖 Redis）

- [ ] EventBus 抽象接口 + InProcess 降级实现（**可作为独立文件先行**，AiModule 注册等 Task 11 后）
- [ ] joinStream 端点（回放 PG + 续 Redis 实时，seq 去重衔接）
- [ ] 前端连接态 6 态状态机（idle/loading/ready/streaming/paused/reconnecting）
- [ ] openThread 融合 joinStream（切回进行中对话自动接上）

### P3 协议清理（未启动）

- [ ] SSE 写入三路解耦（SSE 即时 / Redis 广播 / PG 批量异步），修 TTFB 阻塞
- [ ] stop 统一语义（前端只调 cancel 不 abort fetch，取消有终态）
- [ ] messages 序列化标准化（走 LangGraph messages/tuple，弃手工 toDict）
- [ ] enqueue/rollback 明确语义（当前是假实现）
- [ ] 跨副本 cancel（P1 退化为 owner 本地）

### P4 前端 runtime（设计稿已就绪，代码待前置依赖）

前置依赖：
- [ ] 后端 `tool-node.ts` 写入 `additional_kwargs.tool_status`（P1/P3 后端职责）
- [ ] feedback token 接入 Tailwind preset（`tailwind-preset.ts` 补 feedback 组映射）
- [ ] `LangGraphChatMessage` 类型扩展 args + toolStatus

实现内容：
- [ ] `ToolCallCard` 组件（三态 + 展开态，spec 见 `docs/superpowers/specs/2026-06-15-tool-call-card-design.md`）
- [ ] 6 atom snapshot（messages$ / phase$ / threadId$ / runId$ / lastSeq$ / error$）
- [ ] interrupt 由 messages 派生（取代 Set 去重）
- [ ] `message-bubble.tsx` 重构（ToolMessage 独立渲染为卡片，不再并入 AI 气泡）

### P5 文档安全（文档清理已完成，剩余待做）

- [x] ~~删除 5 篇失真文档 + 修复断链~~（`9a20615`）
- [ ] **user 隔离 — 控制器层**（可立即并行）：`threads.controller.ts` / `runs.controller.ts` 加 `@UseGuards(JwtAuthGuard)` + `@CurrentUser('id')`；`thread.service.ts` 的 `findAll` 修复忽略 `opts.userId` 的 bug
- [ ] **user 隔离 — service 层串接**（等 P1 Task 6/8/9 签名稳定后）：`StartRunOpts` / `createRun` / `RunRecordOpts` 加 userId
- [ ] metrics（ai.ttfb_ms / token_rate / run_duration_ms / reconnect_count / lease_acquire_ms）

---

## 可立即并行的任务（零文件重叠）

以下任务与 P1 剩余代码（ai.service.ts / run-manager.ts / run-state.repository.ts）无文件冲突，可立即启动独立分支：

1. **P5 user 隔离控制器层** — 修真实安全缺陷，仅改 controller + thread.service
2. **P2 EventBus 抽象接口** — 纯新增文件（event-bus.interface.ts / in-process.event-bus.ts），AiModule 注册等 Task 11 后
3. **P4 feedback token 接入 Tailwind** — 仅改 `tailwind-preset.ts` + `globals.css`

---

## 环境备忘

- **Pencil MCP 连接**：需 VS Code Insiders 里安装 Pencil 扩展并打开 `.pen` 文件激活。桌面 Pencil app 与 ZCode 的 MCP 配置不匹配（配置指向 VS Code Insiders 扩展）。
- **`.pen` 编辑规范**：见 `docs/design-system/agent-guide.md`「编辑 .pen 设计稿的布局规范」章节——全程 flex 嵌套，禁用 `layout:"none"` 手写坐标。
- **fnm 环境**：commit 前需加载 node 环境（`fnm env --shell cmd`），husky pre-commit 依赖 npx。
