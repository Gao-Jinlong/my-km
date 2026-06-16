# LLM 前后端对话协议与消息处理流程 — 重构设计

> 日期: 2026-06-15
> 状态: 设计已确认，待实现规划
> 范围: `apps/server/src/ai/` + `apps/web/src/features/ai/` + AI 对话相关文档
> 基线: 忠实对齐 LangGraph Platform 原生协议；多副本部署；完整重连；逐个 interrupt 工具确认

---

## 0. 设计基线与决策摘要

### 0.1 不可动摇的前提

**忠实对齐 LangGraph Platform 原生协议**：

- 前端使用官方 `@langchain/langgraph-sdk` 的 `Client`。
- 后端 `/api/threads/*` + `/api/threads/:id/runs/stream` 是 LangGraph 兼容端点。
- SSE 事件**只有** LangGraph 标准的 `metadata` / `messages` / `values` / `tasks` / `end` / `error`。
- **不自造事件名**。历史文档中的 `text_chunk` / `tool_call` / `status` / `ROOM_BUSY` / `MessageWire` 等自造协议在真实链路中已被废弃，相关描述是历史遗留错误，本设计统一纠正。

### 0.2 关键决策（已与用户确认）

| # | 决策 | 选择 |
|---|------|------|
| D1 | 产出目标 | 深度对齐 LangGraph + 修真实缺陷 + 重写失真文档 |
| D2 | 部署形态 | 多副本 / 集群（PG + Redis 为权威源，进程内为缓存） |
| D3 | 重连能力 | 完整重连（joinStream + 事件回放 + 续实时流） |
| D4 | 工具确认交互 | 保持逐个 interrupt（所有工具都是"前端执行外壳 + 后端 interrupt 暂停"） |
| D5 | 拒绝工具语义 | run 不取消，工具返回"被拒"结果，LLM 继续对话，用户可继续输入 |
| D6 | 工具执行状态标记 | `ToolMessage.additional_kwargs.tool_status`（`completed` / `rejected`）作为前端幂等与渲染的唯一依据 |
| D7 | 前端 snapshot 粒度 | 每属性独立 Atom（6 个源 atom + 派生 selector 不存储） |
| D8 | 工具卡片 UI | design-first 治理：先补 Pencil 设计稿，审核通过后再实现，代码不先于设计稿 |
| D9 | EventBus | 抽象接口 + 单进程降级（本地开发不强依赖 Redis，多副本启用 RedisEventBus） |
| D10 | 交付顺序 | P1 权威源 → P2 重连 → P3 协议清理 → P4 前端 runtime → P5 文档安全 |

---

## 1. 现状缺陷分级（按多副本 + 完整重连基线重新评级）

| 级别 | 缺陷 | 现状代码 | 后果 |
|------|------|---------|------|
| 🔴 致命 | run 状态/事件流是进程内权威（`RunManager.runs` Map + `RunEventStore.buffer` 内存 Map） | `run-manager.ts:30`、`run-event-store.ts:49` | 多副本下 resume/cancel/join 打到错误副本；任一副本重启内存 run 全丢 |
| 🔴 致命 | resume 依赖进程内存查找活跃 run | `ai.service.ts:101` `getActiveRunForThread` | 服务重启 → 所有 interrupted run 永久卡死，前端无法续跑 |
| 🔴 致命 | `joinStream` 返回 501，无事件回放 | `threads.controller.ts:276` | 刷新/断网 = 丢失正在生成的回复，违反"完整重连" |
| 🟠 高 | `emitEvent` 对每个 `values`/`tasks` 事件 `await` 写 PG | `run-record.ts:149` | 高频节点状态更新阻塞 SSE，拖慢首 token（TTFB） |
| 🟠 高 | `stop()` 双信号冲突（前端 abort 本地 fetch + 后端 cancel，cancel 后缓冲事件仍 flush） | `chat-runtime.ts:103`、`run-record.ts:76` | 取消后可能回灌脏事件，前端渲染闪烁/错误 |
| 🟠 高 | `enqueue`/`rollback` 是假实现 | `ai.service.ts:459` | 协议承诺与实现不符 |
| 🟡 中 | 消息序列化手工 `toDict()`/`_getType()` | `ai.service.ts:379` | LangChain 升级即碎，`messages` 事件未走 `messages/tuple` 标准 |
| 🟡 中 | interrupt 去重靠单一 `Set` + 阻塞 Promise | `chat-runtime.ts:33` | 并发工具调用/用户拒绝后重试行为不确定；重连重复弹窗 |
| 🟡 中 | `openThread` 只读 checkpoint 静态消息，不感知运行中 run | `chat-runtime.ts:56` | 切回进行中对话看不到实时进度 |
| 🟢 低 | 4 篇核心文档描述的协议字段在真实链路中根本不存在 | `ai-architecture-v2.md` 等 | 新人/agent 按文档对接必然踩坑 |
| 🟢 低 | traceId 双路传递（metadata 事件 + header），frontend tool traceContext 链路缝补中 | 多 commit | 可观测性脆弱 |

---

## 2. 权威状态层与数据模型

### 2.1 核心原则

**PG 是唯一权威源，进程内只是执行态缓存。** run 的状态、事件流、租约归属全部落 PG；任何副本都能从 PG 恢复一个 run 的全部上下文。

### 2.2 数据模型（PG）

```
┌─────────────────────────────────────────────────────────────┐
│ Run                                                          │
├─────────────────────────────────────────────────────────────┤
│ id            String   @id          // cuid                 │
│ threadId      String                                        │
│ assistantId   String   default "default"                    │
│ status        RunStatus           // 见 2.3 状态机           │
│ inputKind     "message"|"resume"   // 区分新 run / 恢复      │
│ content       String?             // 用户输入(仅新 run)      │
│ requestContext Json?              // 编辑器上下文快照        │
│ resumePayload Json?               // command.resume (仅恢复) │
│ llmConfig     Json                // provider/model 快照     │
│ ownerId       String?             // 持有执行的副本 ID       │
│ leaseUntil    DateTime?           // 租约过期时间            │
│ lastSeq       Int      default 0  // 已持久化最大事件 seq    │
│ traceId       String?                                      │
│ tokenUsage    Json                // prompt/completion/total │
│ startedAt     DateTime?                                     │
│ completedAt   DateTime?                                     │
│ error         String?                                      │
│ createdAt     DateTime                                     │
│ updatedAt     DateTime                                     │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ RunEvent  (已存在，补约束)                                   │
├─────────────────────────────────────────────────────────────┤
│ runId      String                                           │
│ threadId   String                                           │
│ seq        Int              // per-run 单调递增             │
│ eventType  "metadata"|"messages"|"values"|"tasks"|"end"|"error"
│ eventName  String?                                         │
│ payload    Json                                            │
│ createdAt  DateTime                                        │
│ @@unique([runId, seq])          // ← 关键:防重号             │
│ @@index([runId, seq] ASC)       // ← 回放按序读             │
└─────────────────────────────────────────────────────────────┘
```

`ownerId` / `leaseUntil` / `lastSeq` 三个新字段是多副本的支点。

### 2.3 Run 状态机（持久化驱动）

```
                  startRun(input)
   pending ───────────────────► running
                                 │
        ┌────────────────────────┼─────────────┐
        │ (interrupt() in graph) │ (end)       │ (abort/异常)
        ▼                        ▼             ▼
   interrupted ◄──────────── completed      failed
        │  ▲                                        ▲
        │  │ command.resume                         │
        │  └─ acquireLease ──► running              │
        │ (interrupt 超时清理)                       │
        └──────────► cancelled ────────────────────┘
```

**关键稳态 = `interrupted`**：graph 暂停在 checkpoint，owner 副本**释放执行**（graph 迭代器结束、abort），但 run 行留在 PG，等待任意副本的 resume 抢占。这是进程外 resume 的前提。

**interrupted 的唯一出路是 `resume → running`**（第 4 节）。注意区分：
- **用户拒绝工具**：走 resume（`tool_result.rejected=true`），run 回到 `running`，**不进 cancelled**（D5）。
- **interrupt 长期无人 resume 的超时清理**：由独立定时任务将超时的 `interrupted` run 标记为 `cancelled`（超时阈值由部署配置，非本设计硬编码）。这是卫生清理，非用户行为。

### 2.4 租约机制（单一执行者保证）

一个 run 同一时刻**只能有一个副本执行**（否则重复 LLM 调用 + checkpoint 冲突）。用乐观租约实现，无需分布式锁服务：

```sql
-- acquireLease(runId, replicaId, ttl=30s)
UPDATE "Run"
SET    "ownerId" = $replica, "leaseUntil" = now() + interval '30s'
WHERE  id = $runId
  AND  ("ownerId" IS NULL
        OR "ownerId" = $replica
        OR "leaseUntil" < now())   -- ← 旧 owner 失效，可抢占
RETURNING *;
```

- **创建 run**：`ownerId = 本副本`，租约 30s
- **执行中**：每 10s heartbeat 续期（`UPDATE leaseUntil`）
- **resume / 接管**：若 RETURNING 为空 → 说明 owner 还活着且不是自己 → 返回 `409 owner_busy`
- **优雅退出**：释放租约（`ownerId = NULL`）
- **崩溃**：租约自然过期，其他副本可抢占

### 2.5 事件 seq 策略（跨 owner 连续）

seq 由 owner 进程内生成，起点和持久化锚定 PG：

- owner 启动执行时读 `Run.lastSeq` 作为 `localSeq` 起点
- 每批 flush 后更新 `Run.lastSeq = max(已写 seq)`
- 副本 B 接管（resume）时，从 `Run.lastSeq + 1` 继续 → seq 跨 owner 连续

因为租约保证单一 owner，进程内 `localSeq++` 在 owner 生命周期内安全，只是边界（启动/接管）以 PG 为准。`@@unique([runId, seq])` 作为最终防线——并发写入重号时 DB 拒绝，owner 转入 failed。

### 2.6 进程内缓存（非权威）

`RunManager` 退化为 **owner 的执行态缓存**，不再是真相来源：

```
RunSession {              // 仅存在于 owner 副本内存
  record: Run             // PG 行的快照
  abortController
  graphStreamIterator     // LangGraph 有状态迭代器
  sseSubscribers: Set<RunEventSink>   // 第 3 节，多个 joinStream 订阅者
  localSeq: number
  flushBuffer: RunEvent[] // 待批量写 PG（第 3 节解耦）
}
```

- 缓存可随时丢弃，重建只需读 PG + checkpoint
- `getActiveRunForThread` 改为查 PG（`status IN (running, interrupted)`），不再查内存

### 2.7 owner 概念定义

**owner = 当前持有某个 run 执行权的那个后端进程实例（副本）。**

- 一个 run 在任意时刻**最多有一个 owner**，由 PG 行上的租约界定（`Run.ownerId` + `Run.leaseUntil`）。谁抢到租约，谁就是 owner。
- **owner 副本**持有 graph 迭代器、`AbortController`、`RunSession`（内存缓存），能执行 graph / 生成事件 / 续租约 / abort。
- **非 owner 副本**无该 run 的内存状态，只能读 PG（状态/回放）+ 订阅 Redis（实时事件）。
- 举例：用户发消息 → LB 打到副本 A → A `acquireLease` 成功 → A 成为 owner。副本 B/C 对这个 run 无感知。用户刷新，重连请求打到副本 B → B 通过 PG 回放 + Redis 实时把流续给客户端。A 崩溃 → 租约 30s 过期 → 副本 C 抢占成为新 owner → 从 checkpoint 恢复继续跑。

---

## 3. 连接层 — 完整重连、事件分发、写入解耦

### 3.1 前提：Redis 已就绪

项目 `docker-compose` 已含 Redis（`AGENTS.md` 快速开始里的 `docker-compose up -d postgres redis`）。本节用它做跨副本事件分发，不引入新基础设施。

### 3.2 事件分类

| 类别 | 事件 | 频率 | 写 PG | 广播 Redis | 说明 |
|------|------|------|-------|-----------|------|
| 状态边界 | `metadata` `values` `tasks` `end` `error` | 低（节点级） | ✅ | ✅ | 重连必须能回放 |
| 临时 | `messages`（token chunk） | 高（每 token） | ❌ | ✅ | 实时滚动用，不落盘 |

关键洞察：`messages` token 流是临时的。重连时**不需要回放中间 token**——客户端会先从 PG 收到最新 `values`（含累积到此刻的完整 AI 文本），视觉上"跳到最新累积点"，再从 Redis 续收后续 token。

### 3.3 三条写入路径解耦（修 TTFB 阻塞）

```
                  graph.stream chunk
                         │
                         ▼
              ┌─ RunSession.emit(event) ─┐
              │                          │
   ┌──────────┴──────────┐    ┌─────────┴──────────┐
   ▼                     ▼    ▼                      ▼
[1] SSE 即时推      [2] Redis 即时广播     [3] PG 批量异步写
 owner 本地订阅者    pub run:{runId}        仅持久化事件
 (含 messages)      (含 messages)          累积 flushBuffer
                    非owner副本订阅者       达阈值/结束时flush
```

- **[1]** 同步，零延迟——token 流畅
- **[2]** 同步 `PUBLISH`（Redis 单次往返 ~ms）——非 owner 副本实时性
- **[3]** **异步**，攒批写入，不阻塞前两路——`Run.lastSeq` 在 flush 后更新

三者全失败也不丢终态：`end` / `error` 走"写 PG 成功后才发 SSE"的特殊路径（终态事件降级为同步写，保证不丢）。

### 3.4 Redis Channel 拓扑

```
channel:  run:{runId}        ← 按 run 分 channel，非全集群广播
message:  { seq, eventType, payload }
订阅者:   所有持有该 run SSE 连接的副本
```

副本启动时**懒订阅**——首个 SSE 连接需要某 runId 时才 `SUBSCRIBE run:{runId}`，最后一个连接关闭时 `UNSUBSCRIBE`。用副本级 `Map<runId, Set<sseConn>>` 索引管理。

### 3.5 joinStream：完整重连协议

```
GET /api/threads/:tid/runs/:rid/stream?since=N
  │  since = 客户端已确认的最大 seq（0 = 从头）
  ▼
┌──────────────────────────────────────────────────────┐
│ Step 1: 读 Run 行，判状态                              │
│   - completed/failed/cancelled → 纯回放模式           │
│   - running/interrupted       → 回放 + 续实时         │
│   - 不存在                    → 404                   │
├──────────────────────────────────────────────────────┤
│ Step 2: SUBSCRIBE run:{rid}  (先订后读，防漏)         │
├──────────────────────────────────────────────────────┤
│ Step 3: PG 回放 seq > N 的持久化事件                   │
│   逐条写 SSE                                          │
├──────────────────────────────────────────────────────┤
│ Step 4: 衔接到实时                                     │
│   Redis 消息队列里 ≥ PG.lastSeq 的事件，客户端按 seq  │
│   去重后渲染；之后纯收 Redis 实时                      │
├──────────────────────────────────────────────────────┤
│ Step 5: 终态 (end/error) 出现 → 关闭 SSE              │
└──────────────────────────────────────────────────────┘
```

**衔接点正确性**靠"先订阅 Redis、再读 PG"：回放读到 `maxSeq=M`，Redis 队列里 `seq>M` 的事件已开始累积，客户端按 `seq` 去重（本地记 `lastRenderedSeq`，`<=` 的丢弃）。重叠区不会重复渲染。

**`since` 参数**：前端断线重连时携带本地已渲染的 `lastSeq`，只补后续——避免每次重连从头回放整个对话。

### 3.6 客户端重连时序

```
用户           副本B(非owner)      Redis         副本A(owner)      PG
 │ │                │               │               │              │
 │ 刷新页面         │               │               │              │
 │ openThread(tid)  │               │               │              │
 │─────GET /runs/:rid/stream?since=12──────────────►│              │
 │                  │ 读 Run.status=running         │              │
 │                  │ SUBSCRIBE run:{rid} ─────────►│              │
 │                  │ SELECT ... WHERE seq>12 ───────────────────►│
 │ ◄──回放 seq13..18(values快照)                    │              │
 │                  │               │               │              │
 │                  │   ◄── pub seq19(messages token)─────────────│
 │ ◄──seq19 token 滚动               │              │              │
 │      ...持续收 Redis 实时...       │              │              │
```

副本 B 全程不碰 owner 内存，纯靠 PG + Redis 还原完整流。

### 3.7 stop 信号统一语义

| 角色 | 行为 |
|------|------|
| 前端 `stop()` | **只**调 `POST /runs/:rid/cancel`，**不** abort 本地 fetch。等 SSE 自然收到终态 |
| 后端 `cancel` | acquireLease → `abortController.abort()` → graph 停止 → flush 缓冲 → 写 `end` 事件（payload 标 `finish_reason:"cancelled"`） → 释放租约 |
| SSE 终止 | 后端写完终态事件后正常关闭流，客户端收到 `end` 后清理 streaming 状态 |

效果：取消是**有终态的**，前端永远能通过 SSE 得知 run 真正结束，不会卡在 `isStreaming=true`。

本地 fetch 的 abort 只保留一个场景：**前端组件卸载**（unmount）时 abort，因为此时 UI 已消失，收不收终态无所谓——但要保证后端 run 继续跑到终态（PG 留痕），而非半途中断。

### 3.8 SSE 订阅抽象

```
interface RunEventSink {
  push(event): void          // 把事件写给这条 SSE 连接
  close(): void
}
```

owner 的 `RunSession.sseSubscribers: Set<RunEventSink>`——发起者和重连者一视同仁，都从内存推（含 messages token）。非 owner 副本的数据源是 Redis channel。对客户端而言协议完全一致，无需区分。

### 3.9 心跳与租约联动

SSE 空闲时（LLM 思考中、等首 token）每 15s 发 `: heartbeat\n\n`（SSE 注释行，客户端忽略），防中间代理超时断连。租约 heartbeat 每 10s 续期，与 SSE 心跳解耦。

---

## 4. 工具调用链路 — 进程外 resume 与并发正确性

### 4.1 interrupt 机制（已正确，不动）

`tool-node.ts` 对每个 `tool_call` 调 `interrupt({tool_call_id, tool_name, args})` → LangGraph 把 interrupt 写进 **checkpoint 的 `__interrupt__`** → graph 暂停。interrupt 状态本就持久化在 PostgresSaver 的 checkpoint 里，任何副本都能读出来。

### 4.2 interrupted 作为"释放执行"的稳态时序

```
graph 执行 → tool-node interrupt() → graph 暂停，checkpoint 落 PG
                                         │
   owner 副本:                            ▼
     1. 检测到 stream 结束且 hasInterrupt=true
     2. Run.status = interrupted (写 PG)
     3. 写 tasks 事件(interrupt 详情)到 PG + Redis
     4. 不发 end —— 发"中断但未结束"暂停标记
     5. 释放 RunSession: abort graph 迭代器，清内存
     6. 释放租约 (ownerId=NULL)
```

**协议补充**：LangGraph 原生 `end` 表示流结束。interrupted 暂停时**不**发 `end`（run 没真正结束），而是让 stream 在发完 `tasks`（含 interrupt）后由 owner 关闭连接。客户端据此知道"run 暂停了，等用户操作"，而非"run 完成了"。前端 `isStreaming=false` 但 `interrupt≠null`。

### 4.3 进程外 resume 时序（任意副本）

```
前端 (确认后浏览器执行工具) ──POST /runs/stream {command:{resume:{tool_call_id,tool_result}}}──► 任意副本 B
                                                                       │
                                                  ┌────────────────────┴───────────────────┐
                                                  ▼                                         │
                            1. 读 PG Run 行，确认 status=interrupted                          │
                            2. acquireLease(B)  ◄── 租约竞争                                │
                               - interrupted 状态下 owner 已释放 → 通常直接成功              │
                               - 若另一客户端抢先 resume → status 已变 running → 409         │
                            3. Run.resumePayload = command.resume (写 PG，幂等锚)            │
                            4. Run.status = running                                          │
                            5. 从 checkpoint 重建 graph                                      │
                            6. executeRunProtocol(input = new Command({resume}))             │
                               - graph 从 checkpoint 恢复，interrupt() 返回 resume 值        │
                               - tool-node 把 tool_result 包成 ToolMessage                   │
                               - 路由回 llm_call 继续                                        │
                            7. 新的 SSE 事件流(metadata→values→messages→...)                │
                                                  │                                         │
                                                  └─ 走第 3 节的 PG+Redis 分发 ◄────────────┘
```

副本 B 不需要知道原 owner 是谁——它从 PG + checkpoint 拿到一切。

### 4.4 并发 resume 的正确性

| 情况 | 结果 |
|------|------|
| 两个 resume 几乎同时到达不同副本 | `acquireLease` 是单条 `UPDATE...RETURNING`，PG 行锁保证只有一个 RETURNING 非空 → 赢家执行，输家 `409 owner_busy` |
| 同一 resume 被重试（幂等） | 第一次成功后 status=running，第二次因 `status≠interrupted` 被拒 |

**幂等锚 = `tool_call_id`**：resumePayload 写 PG 时带上 `tool_call_id`，重复提交同一 `tool_call_id` 的 resume，若该 id 已处理（checkpoint 里 interrupt 已解除），后端返回当前 run 状态快照而非重新执行。

### 4.5 多工具调用 = 串行 interrupt 循环

`tool-node.ts:30` 的 `for` 循环里每个 `tool_call` 各调一次 `interrupt()`。LangGraph 语义：`Command({resume})` 只解锁当前这一个 interrupt，下一个 interrupt 会在 resume 后再次暂停。AI 一次调 3 个工具 = 3 次 interrupt/resume 往返。与"逐个 interrupt"决策一致，无需改 tool-node。

### 4.6 用户拒绝工具的语义（D5）

```
用户拒绝工具
  → 前端 resume: { tool_call_id, tool_result: { rejected: true, reason: "用户拒绝" } }
  → 后端 tool-node 生成 ToolMessage（内容是被拒信息，additional_kwargs.tool_status="rejected"）
  → LLM 收到"工具被拒" → LLM 自行决定下一步
  → LLM 可以：换工具 / 直接回答 / 反问"你想怎么做"
  → run 继续为 running，不进 cancelled
  → 用户之后可正常继续输入（新 send_message 走正常流程）
```

run 全程不停，控制权交回 LLM 的对话能力。

### 4.7 工具执行状态标记（D6，前端幂等与渲染的唯一依据）

后端 `tool-node.ts` 生成 ToolMessage 时，在 `additional_kwargs` 写入执行状态（复用现有 `hide_from_ui` 同款载体模式）：

```ts
// tool-node.ts 生成 ToolMessage 时
new ToolMessage({
  tool_call_id: toolCall.id,
  name: toolCall.name,
  content,
  additional_kwargs: {
    tool_status: resume.rejected ? 'rejected' : 'completed',
  },
})
```

前端判据（替换 `chat-runtime.ts:33` 那个脆弱的 `Set`）：

```
对一个 tool_call_id，扫描当前 messages 列表:
  - 找不到对应 ToolMessage           → 待执行（interrupt 待解决，弹确认 UI）
  - 有 ToolMessage, status=completed → 已完成历史（渲染结果卡片，不弹窗）
  - 有 ToolMessage, status=rejected  → 被拒历史（渲染被拒提示，不弹窗）
```

**一举两得**：
- **幂等性**：回放/重连时，已完成的工具因有 ToolMessage 标记，绝不重复弹窗——根治缺陷 #7。
- **UI 渲染**：`tool_status` 直接驱动工具卡片视觉状态。回放态与实时态用同一套判据，不再有"回放不触发、实时才触发"的分裂逻辑。

### 4.8 resume 的 HTTP 协议形状（无变化）

保持现状 `POST /api/threads/:tid/runs/stream`，body：

```json
{
  "input": null,
  "command": { "resume": { "tool_call_id": "...", "tool_result": {...} } },
  "assistant_id": "default",
  "stream_mode": ["messages","values","tasks"]
}
```

后端 `threads.controller.ts:219` 检测 `command.resume` 分流。协议形状不变，变的是后端处理路径（加 acquireLease + checkpoint 恢复）。

---

## 5. 前端 Runtime 重构

### 5.1 现状问题（前端侧）

| 缺陷 | 现状代码 | 问题 |
|------|---------|------|
| snapshot 是扁平状态，无连接态 | `chat-runtime.ts:32` | 区分不了首次发起/实时/重连/重连完成 |
| `openThread` 只读 checkpoint 静态消息 | `chat-runtime.ts:56` | 切回进行中对话看不到实时进度（缺陷 #9） |
| interrupt 靠 `Set` 去重 | `chat-runtime.ts:33` | 重连重复弹窗（缺陷 #7，第 4 节已改 tool_status 驱动） |
| `stop()` abort 本地 fetch | `chat-runtime.ts:103` | 取消无终态（第 3 节已改协议） |
| 工具卡片只显示名字 | `message-bubble.tsx:66` | 无 pending/completed/rejected 视觉区分 |
| 编辑器上下文每秒轮询 | `ai-panel.tsx:130` | 无谓开销 |

### 5.2 Runtime 连接态状态机

```
                        openThread(tid)
   idle ──────────────────────────────────► loading
                                                │
                                     ┌──────────┴──────────┐
                                     ▼                     ▼
                         (有运行中 run)              (无运行中 run)
                          自动 joinStream               ready
                              ▼                     (可输入发送)
                  ╔═══════════════════════════╗
                  ║   streaming               ║
                  ║   (收 SSE 事件)            ║
                  ╚═══════════╤═══════════════╝
                              │
                ┌─────────────┼─────────────┐
                ▼             ▼             ▼
           end/error      interrupt      网络断开
            ready          paused      reconnecting
                              │               │
                       用户操作 resume     自动 joinStream
                              │               │
                              └────► streaming ◄─┘

   (另：ready 态发起 send_message/resume → 直接进入 streaming)
```

| phase | 含义 | UI 表现 |
|-------|------|--------|
| `idle` | 无 thread | 空状态 |
| `loading` | openThread 中，读 checkpoint | 骨架屏 |
| `ready` | 空闲，可输入 | 输入框可用 |
| `streaming` | 收 SSE，AI 生成中 | 打字光标 + Stop 按钮 |
| `paused` | interrupt 待用户操作 | 工具确认弹窗（仅 tool_status=待执行的） |
| `reconnecting` | SSE 断开，joinStream 中 | 断线提示条 + 重连动画 |

`isStreaming` 保留为派生值（`streaming || reconnecting`），不破坏现有 hook 消费方。

### 5.3 openThread 融合 joinStream

`openThread(threadId)` 改为**三段式**：

```
openThread(tid):
  1. GET /api/threads/:tid/state   ← 读 checkpoint，渲染历史消息
     (含所有 ToolMessage + tool_status 标记)
  2. 查 run 状态: 有无 status∈{running,interrupted} 的活跃 run?
  3. 若有活跃 runId:
       GET /api/threads/:tid/runs/:rid/stream?since=lastSeq
       → joinStream 回放 + 续实时
     若无: phase=ready
```

切回进行中的对话时，自动接上正在跑的 run——缺陷 #9 解决。`since=lastSeq` 从最近一条持久化事件的 seq 推断，避免从头回放。

### 5.4 自动重连（reconnecting 态）

SSE 连接因网络断开（非用户主动 stop）时：

```
连接断开
  → phase=reconnecting (保留已渲染 messages，叠加断线条)
  → 指数退避重试 joinStream?since=本地最后确认 seq
  → 成功: phase 回到 streaming/paused(视 run 状态)
  → 重试达上限: phase=ready, error="连接断开，可重试"
```

已渲染的 messages 不清空，重连只补后续事件。前端靠 `seq` 跳过重复。

### 5.5 snapshot 粒度：每属性独立 Atom（D7）

6 个源 atom（各自独立 Emitter，订阅者按需订阅）：

```
messages$    LangGraphChatMessage[]   // 高频，token 流唯一热路径
phase$       ConnectionPhase          // 连接态
threadId$    string | null
runId$       string | null
lastSeq$     number                   // 重连锚
error$       { code, message } | null
```

派生 selector 不存储（消费方按需计算，避免与源打架）：

```
isStreaming            = phase ∈ {streaming, reconnecting}
isLastMessageStreaming = isStreaming && messages末条是ai
interrupt              = deriveInterrupt(messages)   // 第 4 节 tool_status 派生
```

对接现有体系：项目已有 `base/common/event` 的 `Emitter`/`Event`，每个 atom 就是一个 `Emitter` + 当前值快照，hook 用 `useSyncExternalStore` 逐 atom 包装：

```
useRuntimeState(selector):
  订阅 selector 依赖的 atom(s)
  selector 返回值做 Object.is 比较，变化才触发重渲染
```

收益：
- `MessageBubble` 列表订阅 `messages$`——token 打字效果只重渲染它，合理。
- Stop 按钮/输入框订阅 `phase$`——token 流期间纹丝不动。
- 错误条订阅 `error$`——罕见更新。
- `interrupt` 确认弹窗由 `messages$` + selector 驱动——幂等。

React 18+ 自动批处理让同事件内多个 atom 更新合并成一次重渲染。`updateSnapshot(patch)` 拆成对各 atom 的定向 `set`，token 高频路径只触 `messages$`。`use-langgraph-stream.ts` 返回值保持向后兼容（聚合读取），但底层是 6 个 atom，effect 精准。

### 5.6 interrupt 派生（取代 Set 去重）

```ts
// interrupt 不再单独存储，从 messages 派生
function deriveInterrupt(messages): ToolInterrupt | null {
  // 找最后一条 AIMessage 的 tool_calls
  // 对每个 tool_call_id 查是否有对应 ToolMessage（tool_status）
  // 若存在"无 ToolMessage"的 tool_call → 该 interrupt 待解决
  // interrupted run 必然在最后一条 AI 上有未配对的 tool_call
  return pendingToolCall ?? null
}
```

只在 `connectionPhase ∈ {streaming, paused}` 时计算，`paused` 时才有值。回放态（loading）不计算 → 不会因历史 interrupt 弹窗。实时收到新 `tasks` → 消息更新 → 重新派生 → 自然触发。幂等，无需 Set。

### 5.7 工具卡片渲染（D8，需先补设计稿）

`tool_status` 驱动三态视觉：

```
┌─ AIMessage ────────────────────────┐
│  我来搜索相关资料...                │  ← AI 文本
├───────────────────────────────────┤
│  🔍 search  ◌ 转圈      pending   │  ← tool_call 无 ToolMessage
└───────────────────────────────────┘

┌─ ToolMessage(紧跟其后) ────────────┐
│  ✓ search    completed            │  ← tool_status=completed
│  找到 3 条结果...                  │
└───────────────────────────────────┘

┌─ ToolMessage ──────────────────────┐
│  ✕ search    rejected             │  ← tool_status=rejected
│  用户拒绝执行                      │
└───────────────────────────────────┘
```

**design-first 治理（D8）**：工具卡片是新的 UI 元素，**必须先在 Pencil 设计稿中体现，审核通过后再实现**。本设计的工具卡片描述仅作为设计稿的需求输入，实现计划中此部分作为**前置阻塞项**——代码不先于设计稿动手。

`message-bubble.tsx` 把 ToolMessage 作为独立气泡渲染（现状 `projectMessages` 把它并入，需调整投影让它独立成条），配对渲染对应 tool_call 的状态。

### 5.8 取消的 UI 终态

```
stop():
  → 不再 abort fetch
  → POST /api/threads/:tid/runs/:rid/cancel
  → phase 保持 streaming，显示"正在停止..."
  → SSE 收到 end(payload.finish_reason='cancelled')
  → phase=ready，在末尾渲染一条"已停止"提示
```

取消有明确视觉终点，不卡 `isStreaming=true`。

### 5.9 编辑器上下文（顺手优化）

`ai-panel.tsx:130` 的 1s 轮询改为**事件驱动**：编辑器 selection 变更时经 `EventBus` 推送，`ai-panel` 订阅更新 ContextBadge。发送时 `collectEditorContext()` 仍是快照（不变）。

### 5.10 hook 接口稳定性

`use-langgraph-stream.ts` 返回结构保持兼容，新增字段向后添加：

```ts
return {
  ...snapshot,                          // 含 connectionPhase/lastSeq 等新字段
  openThread, sendMessage, resumeWithToolResult, stop,   // 不变
  onConfirmationRequest,                // 不变
}
```

---

## 6. 可观测性、安全、迁移与文档

### 6.1 可观测性（收敛 traceId 双路传递）

| 维度 | 机制 |
|------|------|
| run ↔ 前端 | `metadata` 事件携带 `trace_id`（前端启动时据此关联） |
| 前端 → 后端请求 | `withTraceparent` 中间件注入 header（run 发起/resume/cancel 一致） |
| 前端工具执行 | `ToolDispatchOptions.traceContext` 从 `metadata` 事件的 traceId 派生，单向下传 |

移除 frontend tool traceContext 的多处临时注入点，统一从 runtime 的 traceId 源分发。

新增 metrics：
- `ai.ttfb_ms`（首 token 延迟，验收 TTFB 阻塞修复效果）
- `ai.token_rate`（生成速率）
- `ai.run_duration_ms`（按 status 分桶：completed/interrupted/cancelled/failed）
- `ai.reconnect_count`（重连次数，验收重连稳定性）
- `ai.lease_acquire_ms` + `ai.lease_contention`（租约竞争次数）

### 6.2 安全

现状 AI 端点匿名访问（无鉴权），多副本 + 完整重连放大风险：

- **user 隔离**：`Thread` 已有 `userId` 字段但 `ThreadService.findAll` 未按 user 过滤。run/thread/stream 所有查询加 `userId` scope，从请求的 JWT 提取。**这是多副本前的硬性前置**——否则任何用户能 joinStream 任何人的 run。
- **rate limiting**：复用项目现有 guard 模式，加到 `/runs/stream` 入口。
- **since/seq 边界校验**：joinStream 的 `since` 参数上限校验，防恶意超大回放。
- **EventStore 清理**：`RunEventStore.cleanup` 已有 7 天保留，确认定时任务接入（Cron）。

### 6.3 迁移策略（多副本就绪，单进程可降级）

核心原则：**PG/Redis 是权威，但单进程（无 Redis）模式下能降级运行**，避免本地开发强依赖 Redis。

```
RunSessionStore (进程内缓存，所有副本都有)
       │ 读/写
       ▼
RunStateRepository ──► PG (Run 行，权威状态)
RunEventStore      ──► PG (RunEvent，权威事件流)
EventBus           ──► Redis Pub/Sub (跨副本实时分发)
                          │
              单进程模式: EventBus 退化为进程内 Emitter
              (本地开发不启 Redis 也能跑，只是无跨副本)
```

`EventBus` 抽象接口，两种实现：`RedisEventBus`（多副本）/ `InProcessEventBus`（单进程降级）。部署时按环境选择。

### 6.4 分阶段交付

| 阶段 | 内容 | 价值 | 依赖 Redis | 状态 |
|------|------|------|-----------|------|
| **P1 权威源迁移** | run 状态/事件落 PG，acquireLease，进程外 resume | 多副本正确性基座 | 否 | ✅ 完成 |
| **P2 重连** | joinStream + 回放 + Redis EventBus，前端连接态状态机 | 完整重连 | 是 | ✅ 完成 |
| **P2-4 stop 统一** | 前端 stop 不 abort fetch，取消有终态 | 一致性 | 否 | ✅ 完成 |
| **P2-5 前端连接态** | 6 态状态机，paused 相位，heartbeat 断租 | 鲁棒性 | 否 | ✅ 完成 |
| **P3 跨副本信号** | SSE 解耦为 RunEventSink，跨副本 cancel/interrupt control channel | 多副本完整性 | 否 | ✅ 完成 |
| **P4 前端 runtime** | 6 atom 拆分，tool_status 工具卡片，openThread 融合 | effect 精准 + UI | 否 | ✅ 完成 |
| **P5 文档 + 安全** | 重写失真文档，user 隔离，metrics | 治理 | 否 | 🟡 进行中（文档清理完成） |

每阶段独立可验证、可灰度。P1 不依赖 Redis（单进程 acquireLease 仍成立），P2 才需要 Redis。

### 6.5 失真文档处置

| 文档 | 处置 |
|------|------|
| `docs/ai-conversation-flow.md` | **重写**为单一权威的"LLM 对话协议规范" |
| `docs/backend/ai-architecture-v2.md` | **重写**：删除 Socket.io/Orchestrator/WorkflowExecutor 章节，改为 Thread/Run/RunManager/RunEventStore/EventBus 架构 |
| `docs/backend/llm-integration-guide.md` | **废弃归档**，顶部加链接指向新协议规范 |
| `docs/frontend/frontend-chat-refactor-plan.md` | **废弃归档**（描述已删除的 harness 架构） |
| `docs/frontend/langgraph-runtime.md` | **扩展**为前端 runtime 完整文档 |

---

## 7. NOT in scope（明确推迟）

| 项目 | 推迟原因 |
|------|---------|
| 真正的 `enqueue` 持久化队列（Redis/BullMQ-backed） | 需要 worker + 队列基础设施，超出本次范围 |
| 真正的 `rollback` checkpoint 回滚 | 需要完整 checkpoint 版本管理 |
| 多 assistant / 多 graph 路由 | 保持 `assistant_id="default"` |
| 后端真正执行低危工具（ToolRouter 仅做 frontend interrupt 外壳） | 工具确认决策保持逐个 interrupt（D4） |
| Thread metadata 搜索过滤 | LangGraph 标准 search 支持按 metadata 过滤，后续实现 |
| 认证/鉴权体系改造 | 现有 JWT 体系复用，仅补 user 隔离 scope |
| 消息编辑/重发 | 后端不支持，非当前需求 |

---

## 8. 验收标准

- [x] run 状态/事件流以 PG 为权威源，进程内 RunSession 为缓存（P1）
- [x] acquireLease 单一执行者保证，租约 30s + 10s heartbeat（P1）
- [x] interrupted 状态下 owner 释放执行，resume 可被任意副本接管（P1）
- [x] joinStream 实现"先订阅 EventBus、再回放 PG、seq 去重衔接"（P2）
- [x] EventBus 抽象 + 单进程降级可跑（P2）
- [x] stop 只调 cancel 不 abort fetch，取消有终态（P2-4）
- [x] 前端连接态 6 态状态机，connectionPhase 字段（P2-5）
- [x] SSE 写入三路解耦为 RunEventSink 注册模式（P3）
- [x] 跨副本 cancel 非 owner 返回 202 Accepted（P3）
- [x] 跨副本 interrupt control channel（P3）
- [x] `ToolMessage.additional_kwargs.tool_status` 标记 completed/rejected（P4）
- [x] 前端 6 atom + 派生 selector，effect 范围精准（P4）
- [x] 工具卡片 UI（P4，设计稿已就绪）
- [x] openThread 三段式融合 joinStream（P4）
- [ ] user 隔离覆盖 run/thread/stream 所有查询（P5）
- [x] 5 篇失真文档按 6.5 处置完成（P5）
