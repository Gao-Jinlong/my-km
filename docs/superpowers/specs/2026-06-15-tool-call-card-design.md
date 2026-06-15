# Tool Call Card — 工具调用卡片设计

> 日期: 2026-06-15
> 状态: 设计已确认，待实现计划
> 范围: `apps/web/src/components/workspace/ai-panel/` + `apps/web/src/features/ai/langgraph/`
> 设计稿: `docs/design-system/design-system.pen` → `03 Product Patterns` → "Tool Call Card Pattern"
> 上游 spec: `docs/superpowers/specs/2026-06-15-llm-conversation-protocol-design.md` 第 4.7 / 5.7 节

---

## 0. 背景与目标

### 现状缺陷

AI 对话里工具调用（tool call）的展示存在严重缺陷：

- **无状态区分**：`message-bubble.tsx` 的 `ToolCallIndicator` 只显示工具名 + 永远脉动的 amber 圆点，无论工具是 pending / completed / rejected，视觉完全相同。
- **ToolMessage 被吞并**：`role: 'tool'` 的消息没有独立渲染，被当成普通 AI 消息显示（JSON content 当文本），用户看不懂。
- **裸色违规**：用裸 `bg-amber-500` / `text-amber-400` 等硬编码颜色，违反 design-first token 规范。
- **rejected 无痕迹**：用户拒绝工具后，确认弹窗消失，消息流里不留任何"已拒绝"记录。

### 目标

每个 `tool_call` 渲染为独立的工具卡片气泡（紧跟 AI 文本气泡之后），由 `ToolMessage.additional_kwargs.tool_status` 驱动三态视觉。completed/rejected 卡片可展开查看结构化的参数和结果。

---

## 1. 视觉规格（设计稿权威）

> 权威视觉稿在 `.pen` 文件。以下为文字描述供实现参考，冲突时以设计稿为准。

### 1.1 三态卡片

卡片为独立气泡，横向布局：`[状态图标] [信息列] [右侧徽章+展开钮]`

| 态 | 配色（feedback token） | 左侧图标 | 徽章 | 可展开 |
|----|----------------------|----------|------|--------|
| **pending** | `info`：`bg` 背景 + `default` 边框/图标底 | 旋转 spinner（`Loader2` + `animate-spin`，或 `loader` lucide 图标） | `PENDING`（`info.default` 底 + `fg.on-accent` 文字） | ❌ |
| **completed** | `success`：`bg` 背景 + `default` 边框/图标底 | ✓ check（`fg.on-accent`） | `DONE`（`success.default` 底 + `fg.on-accent` 文字） | ✅ |
| **rejected** | `error`：`bg` 背景 + `default` 边框/图标底 | ✕ x（`fg.on-error`） | `REJECTED`（`error.default` 底 + `fg.on-error` 文字） | ✅ |

### 1.2 信息列内容（三行）

| 行 | 字体 | 内容 |
|----|------|------|
| 工具名 | Inter 13px / 600 | `toolCall.name`（如 `search`、`write_file`） |
| 描述 | Inter 11px / 400 / `fg.secondary` | 人类可读的动作摘要（如"正在搜索工作区文档..."、"找到 3 条相关文档"、"拒绝写入 notes/a.km"） |
| 元信息 | JetBrains Mono 10px / 400 / `fg.muted` | 参数摘要或结果摘要（如 `query: "设计系统"`、`120ms · 3 matches`、`已跳过 · LLM 另寻方案`） |

### 1.3 展开态（completed / rejected）

点击右侧 chevron-down 展开，chevron 变为 chevron-up。展开后内容为 vertical 布局：

```
┌─ 展开卡片 ─────────────────────────────────────┐
│ ✓ search   [COMPLETED]                    ▲   │ ← header（与折叠态一致）
│ ──────────────────────────────────────        │ ← divider（feedback.{state}.default）
│ 参数                                            │ ← 小标签
│ ┌──────────────────────────────────────────┐  │
│ │ 查询词    设计系统                        │  │ ← label-value 对
│ │ 数量上限  5                               │  │
│ └──────────────────────────────────────────┘  │
│ 结果（3 条）                                    │ ← 小标签
│ ┌──────────────────────────────────────────┐  │
│ │ 📄 Design Tokens    docs/spec.md          │  │ ← 带图标的列表行
│ │ 📄 ADR-0001         docs/decisions/0001   │  │
│ │ 📄 Agent Guide      docs/agent-guide.md   │  │
│ └──────────────────────────────────────────┘  │
└────────────────────────────────────────────────┘
```

- **参数区**：每个参数一行 `key(fg.muted, 600, 固定宽 72px) : value(fg.primary, 400)`，不是裸 JSON。
- **结果区**：每条结果一个带 `file-text` 图标的行（标题 Inter 12px/500 + 路径 JetBrains Mono 10px/muted）。
- rejected 卡片展开时：参数区同上，结果区替换为拒绝原因（`tool_result.rejected: true, reason: "..."`）。

### 1.4 配色 token 映射

> ⚠️ feedback token 已在 `.pen` 变量里定义（light + dark 双主题），但**尚未接入 Tailwind preset**。实现前需在 `packages/design-system/src/tailwind-preset.ts` 补充 feedback 组映射（或用 CSS 变量 `var(--color-feedback-*)`）。

| 用途 | token | CSS 变量 |
|------|-------|---------|
| pending 背景 | `color.feedback.info.bg` | `--color-feedback-info-bg` |
| pending 边框/图标底 | `color.feedback.info.default` | `--color-feedback-info-default` |
| completed 背景 | `color.feedback.success.bg` | `--color-feedback-success-bg` |
| completed 边框/图标底 | `color.feedback.success.default` | `--color-feedback-success-default` |
| rejected 背景 | `color.feedback.error.bg` | `--color-feedback-error-bg` |
| rejected 边框/图标底 | `color.feedback.error.default` | `--color-feedback-error-default` |

文本颜色：工具名用对应态的 `feedback.{state}.default`（折叠态）；正文用 `fg.secondary`；元信息用 `fg.muted`。

---

## 2. 组件 API

### 2.1 ToolCallCard 组件

```tsx
interface ToolCallCardProps {
  /** 工具调用信息 */
  toolCall: {
    id: string;
    name: string;
    args?: Record<string, unknown>;
  };
  /** 对应的 ToolMessage（如有则确定状态；无则 pending） */
  toolMessage?: {
    toolCallId: string;
    content: unknown;
    additional_kwargs?: {
      tool_status?: 'completed' | 'rejected';
    };
  };
  /** 折叠/展开受控（可选） */
  expanded?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
}
```

**状态派生逻辑**（来自 LLM 协议 spec 第 4.7 节）：

```ts
function deriveToolStatus(toolCall, toolMessage): 'pending' | 'completed' | 'rejected' {
  if (!toolMessage) return 'pending';
  return toolMessage.additional_kwargs?.tool_status === 'rejected' ? 'rejected' : 'completed';
}
```

### 2.2 渲染位置

卡片是独立气泡，渲染在 AI 文本气泡**之后**。`ai-panel.tsx` 的消息列表遍历时：

- `role === 'ai'` 且有 `toolCalls`：渲染 AI 文本气泡，**不再在气泡内嵌 tool indicator**
- `role === 'tool'`：不再当成 AI 消息渲染，改为渲染 `ToolCallCard`（通过 `toolCallId` 关联到发起它的 AI 消息的 toolCall）

### 2.3 与 ToolConfirmationDialog 的关系

- **pending 卡片只展示状态**，不含确认/拒绝按钮。
- 工具确认仍由独立的 `ToolConfirmationDialog` 处理（现状不变）。
- 用户确认/拒绝后，`tool_status` 经 resume 写入 ToolMessage → 卡片自动从 pending 切换到 completed/rejected。

---

## 3. 数据模型集成点

### 3.1 前端类型扩展（必须改）

`apps/web/src/features/ai/langgraph/types.ts` 的 `LangGraphChatMessage` 当前只有 `{id, name}`，需扩展：

```ts
export interface ToolCallEntry {
  id: string;
  name: string;
  args?: Record<string, unknown>;  // 新增：工具参数
}

export interface LangGraphChatMessage {
  id: string;
  role: 'human' | 'ai' | 'tool' | 'system';
  content: string;
  toolCalls?: ToolCallEntry[];
  toolCallId?: string;
  toolStatus?: 'completed' | 'rejected';  // 新增：来自 additional_kwargs.tool_status
}
```

### 3.2 消息投影扩展（必须改）

`apps/web/src/features/ai/langgraph/message-projection.ts` 的 `toLangGraphChatMessage` 需要从 LangGraph 的 `values` / `tasks` 事件中提取：
- `toolCalls[].args`（当前被丢弃）
- ToolMessage 的 `additional_kwargs.tool_status`

### 3.3 后端 tool-node.ts（上游 P1/P3 负责）

后端 `tool-node.ts` 生成 ToolMessage 时写入 `additional_kwargs.tool_status`（`completed` / `rejected`）。这是 LLM 协议 spec 第 4.7 节的内容，属于 P1 的后端职责，本设计文档不重复。

---

## 4. 验收标准

- [ ] 每个 tool_call 渲染为独立卡片气泡（不再嵌在 AI 气泡内）
- [ ] pending 态：蓝色 info 配色 + spinner + 工具名 + 描述，不含确认按钮
- [ ] completed 态：绿色 success 配色 + ✓ 图标，可展开查看参数 + 结果列表
- [ ] rejected 态：红色 error 配色 + ✕ 图标，可展开查看拒绝原因
- [ ] 展开内容为结构化 label-value 对（非裸 JSON）
- [ ] 全部用 feedback token，零裸 hex 颜色
- [ ] feedback token 接入 Tailwind preset（或用 CSS 变量）
- [ ] 暗色模式下配色正确（token 已有 dark 主题值）
- [ ] `tool_status` 驱动状态切换（回放/重连时已完成的工具不弹确认窗）

---

## 5. 实现前置依赖

| 依赖 | 归属 | 状态 |
|------|------|------|
| 后端 `tool-node.ts` 写入 `tool_status` | P1 / P3 后端 | 待实现 |
| feedback token 接入 Tailwind preset | 本设计（token 层） | 待实现 |
| `LangGraphChatMessage` 类型扩展 args/status | 本设计（前端类型） | 待实现 |
| 设计稿（`.pen`）已就绪 | 本设计 | ✅ 完成 |

---

## 6. NOT in scope

- 工具确认交互流程改造（保持逐个 interrupt + 独立 ToolConfirmationDialog）
- 工具结果的原地编辑/重试
- 多工具调用的并行卡片排序优化（保持串行 interrupt 顺序）
