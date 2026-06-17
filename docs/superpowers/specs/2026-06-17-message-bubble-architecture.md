# 消息卡片组件架构设计

**日期：** 2026-06-17
**范围：** apps/web/src/components/workspace/ai-panel/
**状态：** 设计完成，待实现

---

## 背景

当前 `MessageBubble` 组件承担了所有消息类型的渲染职责，随着未来消息类型（思考链、各类工具卡片等）的增加，组件会持续膨胀，不利于维护和扩展。

本次重构的目标是：
- 将消息渲染逻辑拆分为多个职责单一的组件
- 保持向后兼容（现有调用方无需修改）
- 为未来新增消息类型提供清晰的扩展路径

---

## 设计决策

### 1. 架构模式：外观模式（Facade）

`MessageBubble` 保持为统一入口组件，内部根据消息类型路由到具体子组件。

**优点：**
- 完全向后兼容，`AIPanel` 等调用方零修改
- 统一的消息渲染入口，便于全局逻辑注入

### 2. 目录结构

```
apps/web/src/components/workspace/ai-panel/
├── ai-panel.tsx                ← 调用方不变
├── message-bubble.tsx          ← 外观层（Facade）
├── tool-confirmation-dialog.tsx
└── messages/
    ├── index.ts                ← 统一导出
    ├── types.ts                ← 共享类型定义
    ├── TextMessage.tsx         ← human/ai/system 文本消息
    ├── ToolMessage.tsx         ← tool 角色消息容器
    ├── ToolCallIndicator.tsx   ← 工具调用状态指示器
    └── utils.ts                ← 共享工具函数
```

### 3. 组件分层职责

| 组件 | 职责 | 负责渲染的消息 |
|------|------|---------------|
| **MessageBubble** | 外观层，路由分发 | 所有消息（入口） |
| **TextMessage** | 纯文本消息渲染 | human / ai / system |
| **ToolMessage** | 工具消息容器 | tool 角色消息 |
| **ToolCallIndicator** | 工具调用状态指示器 | ai 消息内的 pending/completed/rejected 状态 |

### 4. 数据流

```
AIPanel
   ↓ messages.map((msg) => <MessageBubble message={msg} />)
MessageBubble
   ├─ role === 'tool' ? → ToolMessage
   │                      └─ [未来扩展] 根据 toolName → FileOpsCard / DocReadCard / etc.
   └─ else → TextMessage
              └─ hasToolCalls ? → ToolCallIndicator[]
```

---

## 详细设计

### MessageBubble（外观层）

```tsx
// message-bubble.tsx
import type { LangGraphChatMessage } from '@/features/ai/langgraph/types';
import { TextMessage } from './messages/TextMessage';
import { ToolMessage } from './messages/ToolMessage';

export interface MessageBubbleProps {
  message: LangGraphChatMessage;
  /** AI 正在流式生成此消息（显示打字光标） */
  isStreaming?: boolean;
}

export function MessageBubble({ message, isStreaming }: MessageBubbleProps) {
  if (message.role === 'tool') {
    return <ToolMessage message={message} />;
  }

  return <TextMessage message={message} isStreaming={isStreaming} />;
}
```

### TextMessage（文本消息组件）

**Props：**
- `message: LangGraphChatMessage` - 消息对象（role: human/ai/system）
- `isStreaming?: boolean` - 是否显示流式光标

**职责：**
- 根据 `role` 决定对齐方式（左/右）、背景色、文字颜色
- 渲染消息内容文本
- streaming 模式下显示闪烁光标
- 对于 ai 消息，渲染工具调用状态指示器列表

### ToolMessage（工具消息组件）

**Props：**
- `message: LangGraphChatMessage` - 消息对象（role: tool）

**职责：**
- 渲染工具结果消息
- 显示工具名称、状态
- 未来可根据 `toolName` 二次分发到具体工具卡片

### ToolCallIndicator（状态指示器）

**Props：**
- `toolCall: ToolCallRef` - 工具调用引用
- `status?: 'pending' | 'completed' | 'rejected'` - 工具状态

**职责：**
- 显示图标（加载中 / 对勾 / 叉号）
- 显示工具名称标签
- 显示参数摘要

### 共享工具函数

```tsx
// messages/utils.ts
export function summarizeArgs(args?: Record<string, unknown>): string {
  // 现有实现迁移至此
}
```

---

## 扩展路径

### 新增思考链消息

1. 在 `ai-panel/messages/` 下新建 `ThinkingMessage.tsx`
2. 在 `MessageBubble` 中增加路由规则（可通过 `additional_kwargs` 或 `role` 区分）
3. 无需修改任何现有调用方

### 新增工具专属卡片

1. 在 `ai-panel/messages/tools/` 下新建 `FileOpsCard.tsx` 等
2. 在 `ToolMessage` 中根据 `toolName` 分发到具体卡片
3. 不影响 `TextMessage` 和其他工具卡片

---

## 迁移步骤

1. 新建 `messages/` 目录及基础文件（index.ts, types.ts, utils.ts）
2. 迁移 `summarizeArgs` 函数到 `utils.ts`
3. 抽离 `ToolCallIndicator` 为独立组件
4. 实现 `TextMessage` 组件
5. 实现 `ToolMessage` 组件
6. 修改 `MessageBubble` 为外观层
7. 迁移/补充单元测试到各组件
8. 手动验证现有功能不变

---

## 测试策略

每个组件独立编写单元测试：

- **TextMessage.test.tsx** - 测试不同 role 的样式、streaming 光标、工具调用指示器渲染
- **ToolMessage.test.tsx** - 测试工具消息的渲染
- **ToolCallIndicator.test.tsx** - 测试三种状态的显示
- **MessageBubble.test.tsx** - 简化为只测试路由逻辑

---

## 设计原则遵循

| 原则 | 遵循情况 |
|------|---------|
| **单一职责** | ✅ 每个组件只负责一类消息的渲染 |
| **开闭原则** | ✅ 新增消息类型无需修改现有组件 |
| **里氏替换** | ✅ 子组件可在入口层面互相替换 |
| **接口隔离** | ✅ 每个组件的 Props 最小化 |
| **依赖反转** | ✅ 入口组件依赖抽象，不依赖具体实现 |

---

## 向后兼容性

✅ 100% 向后兼容：
- `MessageBubble` 的 Props 完全不变
- `AIPanel` 中的调用代码无需修改
- 现有测试无需重写（可补充子组件测试）
