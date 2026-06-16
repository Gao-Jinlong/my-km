# LLM 对话协议重构 P4：前端 6 Atom + 工具卡片

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将前端 `LangGraphChatSnapshot` 拆分为 6 个独立 atom（spec 5.5），interrupt 由 messages 派生（删除 `handledToolCallIds` Set，spec 5.6），实现工具卡片 UI（spec 5.7），并完成 `openThread` 与 `joinStream` 的语义融合。实现后 React effect 触发范围精确，UI 有完整工具确认/取消交互。

**Architecture:**
1. **6 Atom 拆分**：将扁平 `LangGraphChatSnapshot` 拆分为独立 Emitter 的 6 个 atom：`messages`、`connectionState`、`error`、`threadMeta`、`runState`、`interruptState`。`useLangGraphStream` 通过 selector 精确订阅，避免无关状态变更导致重渲染。
2. **interrupt 派生**：删除 `handledToolCallIds` Set，interrupt 状态由 `messages` 中 `additional_kwargs.tool_status` 派生。`tool_status=pending` 的消息对应活跃 interrupt，`completed/rejected` 对应已处理。
3. **工具卡片 UI**：`phase=paused` 时渲染工具卡片（Pencil 设计稿先行），支持确认 / 取消。取消调用 `cancelRun` + `stop()`，走 P3 跨副本 cancel 路径。
4. **openThread 融合**：`openThread(threadId)` 统一入口，内部完成三段式（list → getState → joinStream），对外隐藏重连细节。

**Tech Stack:** React 19 + TypeScript 5.7 + Vite 6（前端），Jest + vitest。

**Spec Reference:** `docs/superpowers/specs/2026-06-15-llm-conversation-protocol-design.md` 第 5.5-5.7 节、第 6.4 节。

---

## 关键设计约束（实现时不可违背）

1. **6 Atom 是正交且完整的**：无状态重复，任一 UI 状态变化仅触发对应 atom 的 Emitter。`isStreaming` 等派生字段由 selector 计算，不存为独立 atom。
2. **tool_status 是 interrupt 的唯一真实源**：`handledToolCallIds` Set 必须删除。判断工具是否已处理：检查消息的 `additional_kwargs.tool_status === 'completed' || 'rejected'`。
3. **工具卡片必须与 paused 态绑定**：`connectionPhase === 'paused'` 时才渲染，其他 phase 隐藏。卡片需显示工具名、输入参数预览、确认 / 取消按钮。
4. **取消按钮调用 cancel + stop**：工具取消按钮既调用 `client.runs.cancel(threadId, runId)` 触发 P3 跨副本 cancel，也调用 `stop()` 确保前端状态同步。
5. **向后兼容**：`getSnapshot()` 仍返回扁平对象（基于 6 atom 实时拼接），现有 `useLangGraphStream` hook 通过 selector 适配，调用方零改动。
6. **本阶段边界**：仅前端改动。后端代码零改动（P1/P3 已完成所有后端支持）。**不**做：多工具并行卡片、工具输入编辑。

---

## File Structure

**修改：**
- `apps/web/src/features/ai/langgraph/chat-runtime.ts` — 6 atom 拆分 + Emitter 独立化 + 删除 Set + interrupt 派生
- `apps/web/src/features/ai/langgraph/types.ts` — 新增 atom 类型 + selector 类型
- `apps/web/src/features/ai/langgraph/message-projection.ts` — 新增 `tool_status` 投影 + `extractPendingInterrupts` 派生函数
- `apps/web/src/hooks/use-langgraph-stream.ts` — 接入 selector，精确订阅
- `apps/web/src/components/workspace/ai-panel/message-bubble.tsx` — 工具卡片 UI 组件
- `apps/web/src/features/ai/langgraph/__tests__/chat-runtime.test.ts` — 新增 atom 订阅测试 + interrupt 派生测试

---

## Task 1：6 Atom 拆分（spec 5.5）

**Goal:** 将扁平 `LangGraphChatSnapshot` 拆分为 6 个独立 Emitter 的 atom，实现 selector 精确订阅。

**Files:**
- Modify: `apps/web/src/features/ai/langgraph/chat-runtime.ts`
- Modify: `apps/web/src/features/ai/langgraph/types.ts`

### Step 1：定义 6 Atom 类型

在 `types.ts` 中定义每个 atom 的类型：

```typescript
/** spec 5.5：6 个独立 atom，每个有自己的 Emitter */
export interface LangGraphMessagesAtom {
  messages: LangGraphMessage[];
  lastSeq: number;
}

export interface LangGraphConnectionAtom {
  phase: ConnectionPhase;
}

export interface LangGraphErrorAtom {
  error: string | null;
}

export interface LangGraphThreadMetaAtom {
  threadId: string | null;
}

export interface LangGraphRunStateAtom {
  runId: string | null;
}

export interface LangGraphInterruptStateAtom {
  interrupt: LangGraphToolInterrupt | null;
}

/** 派生 selector 结果（供 hook 使用）*/
export interface LangGraphDerivedState {
  isStreaming: boolean; // phase === 'streaming' || 'reconnecting'
  isLastMessageStreaming: boolean;
}

/** 兼容旧 API：由 6 atom 实时拼接 */
export type LangGraphChatSnapshot =
  & LangGraphMessagesAtom
  & LangGraphConnectionAtom
  & LangGraphErrorAtom
  & LangGraphThreadMetaAtom
  & LangGraphRunStateAtom
  & LangGraphInterruptStateAtom
  & LangGraphDerivedState;
```

### Step 2：chat-runtime 内部使用 6 Emitter

替换 `snapshot` + `_onDidChange` 为 6 个独立 Emitter：

```typescript
// 旧代码（删除）：
// private snapshot: LangGraphChatSnapshot = { ...EMPTY_SNAPSHOT };
// private readonly _onDidChange = new Emitter<void>();

// 新代码（6 atom）：
private readonly messagesAtom = new Emitter<LangGraphMessagesAtom>();
private readonly connectionAtom = new Emitter<LangGraphConnectionAtom>();
private readonly errorAtom = new Emitter<LangGraphErrorAtom>();
private readonly threadMetaAtom = new Emitter<LangGraphThreadMetaAtom>();
private readonly runStateAtom = new Emitter<LangGraphRunStateAtom>();
private readonly interruptStateAtom = new Emitter<LangGraphInterruptStateAtom>();

// 内部状态存储（不暴露，仅 Emitter 推送最新值）
private messagesState: LangGraphMessagesAtom = { messages: [], lastSeq: 0 };
private connectionState: LangGraphConnectionAtom = { phase: 'idle' };
private errorState: LangGraphErrorAtom = { error: null };
private threadMetaState: LangGraphThreadMetaAtom = { threadId: null };
private runStateState: LangGraphRunStateAtom = { runId: null };
private interruptState: LangGraphInterruptStateAtom = { interrupt: null };
```

### Step 3：添加 per-atom subscribe 方法

```typescript
subscribeMessages(listener: (state: LangGraphMessagesAtom) => void): IDisposable {
  return this.messagesAtom.event(listener);
}

subscribeConnection(listener: (state: LangGraphConnectionAtom) => void): IDisposable {
  return this.connectionAtom.event(listener);
}

subscribeError(listener: (state: LangGraphErrorAtom) => void): IDisposable {
  return this.errorAtom.event(listener);
}

subscribeThreadMeta(listener: (state: LangGraphThreadMetaAtom) => void): IDisposable {
  return this.threadMetaAtom.event(listener);
}

subscribeRunState(listener: (state: LangGraphRunStateAtom) => void): IDisposable {
  return this.runStateAtom.event(listener);
}

subscribeInterruptState(listener: (state: LangGraphInterruptStateAtom) => void): IDisposable {
  return this.interruptStateAtom.event(listener);
}
```

### Step 4：保留 `getSnapshot()` 向后兼容

由 6 atom 实时拼接：

```typescript
getSnapshot(): LangGraphChatSnapshot {
  const isStreaming = this.connectionState.phase === 'streaming' 
    || this.connectionState.phase === 'reconnecting';
  return {
    ...this.messagesState,
    ...this.connectionState,
    ...this.errorState,
    ...this.threadMetaState,
    ...this.runStateState,
    ...this.interruptState,
    isStreaming,
    isLastMessageStreaming: isStreaming
      && this.messagesState.messages.length > 0
      && this.messagesState.messages[this.messagesState.messages.length - 1].role === 'ai',
  };
}
```

### Step 5：`updateSnapshot` 拆分为原子更新

替换 `updateSnapshot(patch)` 为每个 atom 的专用更新方法，并在内部调用对应 Emitter.fire：

```typescript
private setMessages(messages: LangGraphMessage[]): void {
  this.messagesState = { ...this.messagesState, messages };
  this.messagesAtom.fire(this.messagesState);
}

private setLastSeq(seq: number): void {
  if (seq <= this.messagesState.lastSeq) return;
  this.messagesState = { ...this.messagesState, lastSeq: seq };
  this.messagesAtom.fire(this.messagesState);
}

private setPhase(phase: ConnectionPhase): void {
  this.connectionState = { phase };
  this.connectionAtom.fire(this.connectionState);
}

private setError(error: string | null): void {
  this.errorState = { error };
  this.errorAtom.fire(this.errorState);
}

private setThreadId(threadId: string | null): void {
  this.threadMetaState = { threadId };
  this.threadMetaAtom.fire(this.threadMetaState);
}

private setRunId(runId: string | null): void {
  this.runStateState = { runId };
  this.runStateAtom.fire(this.runStateState);
}

private setInterrupt(interrupt: LangGraphToolInterrupt | null): void {
  this.interruptState = { interrupt };
  this.interruptStateAtom.fire(this.interruptState);
}
```

### Step 6：在事件处理中调用原子更新

替换所有 `this.updateSnapshot({ ... })` 为原子更新方法调用。例如：
- `handleMetadata` → `setRunId()` + `setThreadId()`
- `finishRun` → `setPhase('ready')` + `setInterrupt(null)`
- `handleProtocolError` → `setError(message)`

### Step 7：运行 chat-runtime 测试确认 PASS

- [ ] Step 1：定义 6 Atom 类型
- [ ] Step 2：chat-runtime 内部使用 6 Emitter
- [ ] Step 3：添加 per-atom subscribe 方法
- [ ] Step 4：保留 `getSnapshot()` 向后兼容
- [ ] Step 5：`updateSnapshot` 拆分为原子更新
- [ ] Step 6：在事件处理中调用原子更新
- [ ] Step 7：运行 chat-runtime 测试确认 PASS
- [ ] Step 8：提交

---

## Task 2：interrupt 派生重写（spec 5.6，删除 Set）

**Goal:** 删除 `handledToolCallIds` Set，interrupt 状态由 messages 的 `tool_status` 派生。

**Files:**
- Modify: `apps/web/src/features/ai/langgraph/chat-runtime.ts`
- Modify: `apps/web/src/features/ai/langgraph/message-projection.ts`

### Step 1：message-projection 添加 tool_status 投影

在 `projectMessages` 中，将 `additional_kwargs.tool_status` 投影到消息对象：

```typescript
export interface LangGraphMessage {
  id: string;
  role: 'human' | 'ai' | 'tool' | 'system';
  content: string;
  toolCalls?: LangGraphToolCall[];
  toolCallId?: string;
  toolName?: string;
  // spec 5.6：tool 状态标记
  toolStatus?: 'pending' | 'completed' | 'rejected';
}

// 在 projectMessages 内部：
const toolStatus = raw.additional_kwargs?.tool_status as 
  'pending' | 'completed' | 'rejected' | undefined;
```

### Step 2：添加 `extractPendingInterrupts` 派生函数

```typescript
/**
 * 从 messages 中派生 pending 状态的 interrupt（spec 5.6）。
 * 扫描所有 toolCall 对应的 tool_status === 'pending' 的消息。
 */
export function extractPendingInterrupts(
  messages: LangGraphMessage[],
): LangGraphToolInterrupt[] {
  const pending: LangGraphToolInterrupt[] = [];
  for (const msg of messages) {
    if (msg.toolStatus === 'pending' && msg.toolCallId && msg.toolName) {
      pending.push({
        toolCallId: msg.toolCallId,
        toolName: msg.toolName,
        input: msg.content, // TODO：从 toolCall args 提取更精确
      });
    }
  }
  return pending;
}
```

### Step 3：删除 chat-runtime 的 `handledToolCallIds` Set

删除成员变量 + 所有 `has()` / `add()` 调用。

### Step 4：`handleToolInterrupt` 使用派生判断

```typescript
private async handleToolInterrupt(interrupt: LangGraphToolInterrupt): Promise<void> {
  // spec 5.6：由 messages 派生判断是否已处理，不用 Set
  const pending = extractPendingInterrupts(this.messagesState.messages);
  const alreadyHandled = !pending.some(p => p.toolCallId === interrupt.toolCallId);
  if (alreadyHandled) {
    return;
  }
  
  this.setInterrupt(interrupt);
  this.setPhase('paused');

  const result = await this.toolExecutor.dispatch(interrupt.toolName, interrupt.input);
  await this.resumeWithToolResult(interrupt.toolCallId, result);
}
```

### Step 5：`resumeWithToolResult` 成功后更新 toolStatus

在 resume 的 values 事件回调中，将对应消息的 `toolStatus` 更新为 `'completed'`。

### Step 6：添加 interrupt 派生测试

- 发 pending tool_status 消息 → interrupt 触发
- 发 completed tool_status 消息 → 不触发重复 interrupt

### Step 7：运行测试确认 PASS

- [ ] Step 1：message-projection 添加 tool_status 投影
- [ ] Step 2：添加 `extractPendingInterrupts` 派生函数
- [ ] Step 3：删除 chat-runtime 的 `handledToolCallIds` Set
- [ ] Step 4：`handleToolInterrupt` 使用派生判断
- [ ] Step 5：`resumeWithToolResult` 成功后更新 toolStatus
- [ ] Step 6：添加 interrupt 派生测试
- [ ] Step 7：运行测试确认 PASS
- [ ] Step 8：提交

---

## Task 3：use-langgraph-stream hook selector 接入

**Goal:** hook 从订阅全量 snapshot 改为订阅精确 atom，减少无效重渲染。

**Files:**
- Modify: `apps/web/src/hooks/use-langgraph-stream.ts`

### Step 1：改为 per-atom 订阅

```typescript
export function useLangGraphStream(runtime: LangGraphChatRuntime | null) {
  const [messages, setMessages] = useState<LangGraphMessage[]>([]);
  const [connection, setConnection] = useState<ConnectionPhase>('idle');
  const [error, setError] = useState<string | null>(null);
  // ... 其他 atom

  useEffect(() => {
    if (!runtime) return;
    
    const d1 = runtime.subscribeMessages(s => setMessages(s.messages));
    const d2 = runtime.subscribeConnection(s => setConnection(s.phase));
    const d3 = runtime.subscribeError(s => setError(s.error));
    // ... 其他 atom
    
    return () => { d1.dispose(); d2.dispose(); d3.dispose(); };
  }, [runtime]);

  // 派生 isStreaming
  const isStreaming = connection === 'streaming' || connection === 'reconnecting';
  
  return {
    messages,
    connection,
    isStreaming,
    error,
    // ... 其他
  };
}
```

### Step 2：验证 hook 调用方行为不变

AI Panel 调用方应无需改动（字段名兼容）。

### Step 3：运行前端测试确认无 regressions

- [ ] Step 1：改为 per-atom 订阅
- [ ] Step 2：验证 hook 调用方行为不变
- [ ] Step 3：运行前端测试确认无 regressions
- [ ] Step 4：提交

---

## Task 4：工具卡片 UI（spec 5.7，需 Pencil 设计稿审核）

**Goal:** paused 态渲染工具确认卡片，支持确认 / 取消。

**Files:**
- Modify: `apps/web/src/components/workspace/ai-panel/message-bubble.tsx`
- Create: `apps/web/src/components/workspace/ai-panel/tool-call-card.tsx`

### Step 1：创建 ToolCallCard 组件

```tsx
interface ToolCallCardProps {
  toolName: string;
  input: string;
  onConfirm: () => void;
  onCancel: () => void;
  isLoading?: boolean;
}

export function ToolCallCard({
  toolName,
  input,
  onConfirm,
  onCancel,
  isLoading,
}: ToolCallCardProps) {
  return (
    <div className="border border-blue-200 rounded-lg p-4 my-2 bg-blue-50">
      <div className="flex items-center gap-2 mb-2">
        <Icon name="tool" className="w-4 h-4 text-blue-600" />
        <span className="font-medium text-blue-900">{toolName}</span>
      </div>
      <div className="text-sm text-gray-600 mb-3 bg-white p-2 rounded border">
        {input}
      </div>
      <div className="flex gap-2 justify-end">
        <Button
          variant="secondary"
          size="sm"
          onClick={onCancel}
          disabled={isLoading}
        >
          取消
        </Button>
        <Button
          variant="primary"
          size="sm"
          onClick={onConfirm}
          disabled={isLoading}
        >
          确认执行
        </Button>
      </div>
    </div>
  );
}
```

### Step 2：message-bubble 中条件渲染

```tsx
// 在消息气泡组件中
if (message.toolStatus === 'pending' && runtime?.getSnapshot().connectionPhase === 'paused') {
  return (
    <ToolCallCard
      toolName={message.toolName!}
      input={message.content}
      onConfirm={() => { /* dispatch + resume */ }}
      onCancel={() => {
        runtime?.stop(); // P3 cancel 路径
      }}
    />
  );
}
```

### Step 3：集成 runtime 状态

在 AI Panel 层面订阅 interruptState atom，有 interrupt 时渲染工具卡片。

### Step 4：设计稿审核

**TODO**：对照 Pencil 设计稿审核视觉样式，调整间距、颜色、字体。

### Step 5：添加组件测试

- 渲染 pending tool message → 显示卡片
- 点击取消 → 调用 stop()
- 点击确认 → 调用 dispatch

- [ ] Step 1：创建 ToolCallCard 组件
- [ ] Step 2：message-bubble 中条件渲染
- [ ] Step 3：集成 runtime 状态
- [ ] Step 4：设计稿审核
- [ ] Step 5：添加组件测试
- [ ] Step 6：提交

---

## Task 5：openThread 融合 joinStream（spec 5.3 语义统一）

**Goal:** `openThread(threadId)` 成为加载历史 + 续实时的统一入口，对外隐藏 joinStream 细节。

**Files:**
- Modify: `apps/web/src/features/ai/langgraph/chat-runtime.ts`
- Modify: `apps/web/src/features/ai/langgraph/types.ts`

### Step 1：openThread 语义确认

当前 `openThread` 已实现三段式：
1. list runs 查活跃 run
2. getState 渲染历史消息
3. 有活跃 run → joinStream 续实时；无 → ready

### Step 2：joinStream 改为内部方法

将 `joinActiveStream` + `autoReconnect` 标记为 private，对外仅暴露 `openThread(threadId)`。

### Step 3：添加 `openThread` 测试

- thread 有活跃 run → 触发 joinStream
- thread 无活跃 run → phase 落 ready
- 切换 thread → 旧 joinStream 被 abort（generation 机制已实现）

### Step 4：运行测试确认 PASS

- [ ] Step 1：openThread 语义确认
- [ ] Step 2：joinStream 改为内部方法
- [ ] Step 3：添加 `openThread` 测试
- [ ] Step 4：运行测试确认 PASS
- [ ] Step 5：提交

---

## Task 6：回归 + 文档更新

**Files:**
- Modify: `docs/superpowers/specs/2026-06-15-llm-conversation-protocol-design.md`（标注 P4 completed）
- Modify: `docs/superpowers/plans/2026-06-15-llm-protocol-progress.md`（更新进度）
- Verify: 端到端手动测试

### Step 1：全量回归测试

```bash
cd apps/web && pnpm exec vitest run --no-coverage
cd apps/server && pnpm exec jest src/ai --no-coverage
```

### Step 2：端到端手动测试

1. 启动后端 + 前端
2. 发消息触发工具 interrupt
3. 验证工具卡片渲染（paused 态）
4. 点击取消 → 验证 run 被 cancel，SSE 收到 end 事件
5. 刷新页面 → 验证 openThread 重连后仍能看到历史消息
6. 跨副本场景：Instance A 进入 paused，Instance B 调 cancel → A 收到 end 并退出 paused

### Step 3：更新 spec 文档

标注第 5.5-5.7 节已完成。

### Step 4：更新进度文档

将 P4 状态更新为 ✅ Completed。

- [ ] Step 1：全量回归测试
- [ ] Step 2：端到端手动测试
- [ ] Step 3：更新 spec 文档
- [ ] Step 4：更新进度文档
- [ ] Step 5：提交

---

## 验收标准

- [ ] chat-runtime 内部使用 6 个独立 Emitter，无全局 `_onDidChange` fire
- [ ] `handledToolCallIds` Set 已删除，interrupt 由 messages 的 `tool_status` 派生
- [ ] `useLangGraphStream` hook 订阅精确 atom，messages 变更不触发 connection 订阅者重渲染
- [ ] paused 态渲染工具卡片，有确认 / 取消按钮
- [ ] 点击取消按钮调用 `stop()` → 后端 cancel → SSE end 事件
- [ ] `openThread(threadId)` 是外部唯一入口，joinStream 为内部方法
- [ ] 向后兼容：`getSnapshot()` 返回值不变，现有调用方零改动
- [ ] 前端 vitest 全绿，后端 Jest 全绿
- [ ] 端到端测试：工具 interrupt → 卡片渲染 → 取消 → run 终态完整闭环

---

## 本阶段不做（留给后续）

- 多工具并行卡片（当前仅支持单工具串行 interrupt）
- 工具输入编辑（仅预览，不可修改）
- 编辑器上下文事件驱动（当前为一次性注入 SystemMessage）
- checkpoint rollback 细化（P3 框架已完成，语义留后续）

---

## 风险与缓解

| 风险 | 概率 | 影响 | 缓解 |
|------|------|------|------|
| 6 atom 拆分引入状态同步 bug | 中 | 高 | 保留 `getSnapshot()` 作为 truth source，添加一致性测试 |
| 删除 Set 后 interrupt 重复触发 | 低 | 中 | 覆盖 tool_status=completed/rejected 的派生测试 |
| 设计稿审核返工 | 中 | 低 | Step 4 先出粗版本再审，预留 1-2 轮迭代时间 |
| 现有调用方依赖 snapshot 引用相等 | 低 | 中 | `getSnapshot()` 每次返回新对象（与旧行为一致），调用方应无引用相等假设 |

---

## 如何验证端到端

1. 启动后端 + 前端
2. 发消息"搜索知识库"（触发工具 interrupt）
3. 验证：UI 渲染工具卡片，显示"正在等待确认..."
4. 点击"取消" → 验证：卡片消失，消息流显示"工具调用已取消"
5. 刷新页面 → 验证：历史消息正确加载，thread 状态为 ready
6. 跨副本验证：启动两个后端实例（同 PG + Redis，`AI_EVENT_BUS=redis`），Instance A 进入 paused，Instance B 调 POST cancel → Instance A 收到 end 并退出 paused
