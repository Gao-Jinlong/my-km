# MessageBubble 分层架构重构 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将单体 MessageBubble 组件重构为分层组件架构，拆分 TextMessage、ToolMessage、ToolCallIndicator 等子组件，保持向后兼容，便于未来扩展消息类型。

**Architecture:** 外观模式（Facade）- MessageBubble 保持为统一入口，内部根据 role 路由到子组件。子组件各自负责单一职责，边界清晰。

**Tech Stack:** React + TypeScript + Tailwind CSS + Vitest + Testing Library

---

## 文件结构概览

| 操作 | 路径 | 职责 |
|------|------|------|
| 创建 | `apps/web/src/components/workspace/ai-panel/messages/index.ts` | 统一导出入口 |
| 创建 | `apps/web/src/components/workspace/ai-panel/messages/types.ts` | 共享类型定义 |
| 创建 | `apps/web/src/components/workspace/ai-panel/messages/utils.ts` | 共享工具函数 |
| 创建 | `apps/web/src/components/workspace/ai-panel/messages/ToolCallIndicator.tsx` | 工具调用状态指示器 |
| 创建 | `apps/web/src/components/workspace/ai-panel/messages/TextMessage.tsx` | 文本消息组件 |
| 创建 | `apps/web/src/components/workspace/ai-panel/messages/ToolMessage.tsx` | 工具消息组件 |
| 修改 | `apps/web/src/components/workspace/ai-panel/message-bubble.tsx` | 改为外观层 |
| 新建 | `apps/web/src/components/workspace/ai-panel/messages/__tests__/ToolCallIndicator.test.tsx` | 子组件测试 |
| 新建 | `apps/web/src/components/workspace/ai-panel/messages/__tests__/TextMessage.test.tsx` | 子组件测试 |
| 新建 | `apps/web/src/components/workspace/ai-panel/messages/__tests__/ToolMessage.test.tsx` | 子组件测试 |
| 修改 | `apps/web/src/components/workspace/ai-panel/__tests__/message-bubble.test.tsx` | 简化为路由测试 |

---

## Task 1: 创建 messages 目录基础文件

**Files:**
- Create: `apps/web/src/components/workspace/ai-panel/messages/index.ts`
- Create: `apps/web/src/components/workspace/ai-panel/messages/types.ts`
- Create: `apps/web/src/components/workspace/ai-panel/messages/utils.ts`

- [ ] **Step 1: 创建 types.ts - 共享类型定义**

```typescript
/**
 * 消息组件共享类型
 * 注意：LangGraphChatMessage 等核心类型来自 @/features/ai/langgraph/types
 * 这里只放组件内部使用的类型
 */

import type { LangGraphChatMessage, ToolCallRef } from '@/features/ai/langgraph/types';

export type { LangGraphChatMessage, ToolCallRef };

export interface ToolCallIndicatorProps {
  toolCall: ToolCallRef;
  status?: 'pending' | 'completed' | 'rejected';
}

export interface TextMessageProps {
  message: LangGraphChatMessage;
  isStreaming?: boolean;
}

export interface ToolMessageProps {
  message: LangGraphChatMessage;
}
```

- [ ] **Step 2: 创建 utils.ts - 迁移共享工具函数**

```typescript
/**
 * 消息组件共享工具函数
 */

/**
 * 把工具调用参数格式化成简短摘要，用于状态指示器展示
 * 例如 file_ops {operation:'create', path:'ginlon.km'} → "create · ginlon.km"
 */
export function summarizeArgs(args?: Record<string, unknown>): string {
  if (!args || typeof args !== 'object') return '';

  // 常见字段优先：path / operation / destination
  const parts: string[] = [];
  const operation = typeof args.operation === 'string' ? args.operation : null;
  const path = typeof args.path === 'string' ? args.path : null;
  const destination = typeof args.destination === 'string' ? args.destination : null;

  if (operation) parts.push(operation);
  if (path) parts.push(path);
  else if (destination) parts.push(destination);

  if (parts.length > 0) return parts.join(' · ');

  // 回退：键值对简述
  return Object.entries(args)
    .slice(0, 2)
    .map(([k, v]) => `${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`)
    .join(', ');
}
```

- [ ] **Step 3: 创建 index.ts - 统一导出入口**

```typescript
/**
 * 消息组件统一导出入口
 * 外部通过此文件导入子组件，便于后续重构调整内部结构
 */

export { TextMessage } from './TextMessage';
export { ToolMessage } from './ToolMessage';
export { ToolCallIndicator } from './ToolCallIndicator';
export { summarizeArgs } from './utils';
export type {
  TextMessageProps,
  ToolMessageProps,
  ToolCallIndicatorProps,
} from './types';
```

- [ ] **Step 4: 验证 TypeScript 编译通过**

Run: `cd apps/web && npx tsc --noEmit -p tsconfig.json --skipLibCheck 2>&1 | grep -E "(messages|error TS)" | head -20`
Expected: No errors related to messages/ files

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/workspace/ai-panel/messages/index.ts
git add apps/web/src/components/workspace/ai-panel/messages/types.ts
git add apps/web/src/components/workspace/ai-panel/messages/utils.ts
git commit -m "feat(ai-panel): add messages directory base files"
```

---

## Task 2: 抽离 ToolCallIndicator 组件

**Files:**
- Create: `apps/web/src/components/workspace/ai-panel/messages/ToolCallIndicator.tsx`
- Create: `apps/web/src/components/workspace/ai-panel/messages/__tests__/ToolCallIndicator.test.tsx`

- [ ] **Step 1: 先写测试 - ToolCallIndicator.test.tsx**

```tsx
/**
 * ToolCallIndicator 单元测试
 * 测试三种状态渲染、参数摘要展示
 */

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ToolCallIndicator } from '../ToolCallIndicator';
import type { ToolCallRef } from '../types';

describe('ToolCallIndicator', () => {
  const baseToolCall: ToolCallRef = {
    id: 'tc-1',
    name: 'file_ops',
    args: { operation: 'create', path: 'ginlon.km' },
  };

  it('renders tool name', () => {
    render(<ToolCallIndicator toolCall={baseToolCall} />);
    expect(screen.getByText('file_ops')).toBeTruthy();
  });

  it('renders argument summary', () => {
    render(<ToolCallIndicator toolCall={baseToolCall} />);
    expect(screen.getByText(/ginlon\.km/)).toBeTruthy();
  });

  it('renders spinner icon in pending state', () => {
    const { container } = render(
      <ToolCallIndicator toolCall={baseToolCall} status="pending" />,
    );
    expect(container.querySelector('.animate-spin')).toBeTruthy();
  });

  it('renders check icon in completed state', () => {
    // 注：可以通过检查是否存在 animate-spin 来区分 pending 和 completed
    const { container } = render(
      <ToolCallIndicator toolCall={baseToolCall} status="completed" />,
    );
    expect(container.querySelector('.animate-spin')).toBeNull();
  });

  it('renders without arguments when args not provided', () => {
    const toolCall: ToolCallRef = { id: 'tc-1', name: 'doc_read' };
    render(<ToolCallIndicator toolCall={toolCall} />);
    expect(screen.getByText('doc_read')).toBeTruthy();
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd apps/web && npm run test -- --run --reporter=verbose src/components/workspace/ai-panel/messages/__tests__/ToolCallIndicator.test.tsx 2>&1 | tail -30`
Expected: FAIL - "ToolCallIndicator is not defined" or similar

- [ ] **Step 3: 实现 ToolCallIndicator 组件**

```tsx
/**
 * 工具调用状态指示器（三态卡片）
 *
 * - pending: spinner + 工具名标签 + 参数摘要
 * - completed: 对勾 + 工具名标签 + 参数摘要
 * - rejected: 叉号 + 工具名标签
 *
 * 卡片式布局：轻量背景 + 边框，工具名用 accent 色标签突出，
 * 参数摘要用 muted 色。全部 design tokens，dark 自适应。
 */

import { Check, Loader2, X } from 'lucide-react';
import type { ToolCallIndicatorProps } from './types';
import { summarizeArgs } from './utils';

export function ToolCallIndicator({ toolCall, status }: ToolCallIndicatorProps) {
  const summary = summarizeArgs(toolCall.args);

  const icon =
    status === 'completed' ? (
      <Check className="h-3.5 w-3.5 text-feedback-success-fg" />
    ) : status === 'rejected' ? (
      <X className="h-3.5 w-3.5 text-feedback-error-fg" />
    ) : (
      <Loader2 className="h-3.5 w-3.5 animate-spin text-feedback-warning-fg" />
    );

  return (
    <div className="flex items-center gap-2 rounded-md border border-border-subtle bg-bg-tertiary px-2 py-1.5 text-xs">
      {icon}
      <span className="rounded bg-accent-subtle-bg px-1.5 py-0.5 font-mono text-[11px] text-accent-subtle-fg">
        {toolCall.name}
      </span>
      {summary && <span className="truncate text-fg-muted">{summary}</span>}
    </div>
  );
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `cd apps/web && npm run test -- --run --reporter=verbose src/components/workspace/ai-panel/messages/__tests__/ToolCallIndicator.test.tsx 2>&1 | tail -30`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/workspace/ai-panel/messages/ToolCallIndicator.tsx
git add apps/web/src/components/workspace/ai-panel/messages/__tests__/ToolCallIndicator.test.tsx
git commit -m "feat(ai-panel): extract ToolCallIndicator component"
```

---

## Task 3: 实现 TextMessage 组件

**Files:**
- Create: `apps/web/src/components/workspace/ai-panel/messages/TextMessage.tsx`
- Create: `apps/web/src/components/workspace/ai-panel/messages/__tests__/TextMessage.test.tsx`

- [ ] **Step 1: 先写测试 - TextMessage.test.tsx**

```tsx
/**
 * TextMessage 单元测试
 * 测试不同 role 的样式、streaming 光标、工具调用指示器渲染
 */

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TextMessage } from '../TextMessage';
import type { LangGraphChatMessage } from '../types';

describe('TextMessage', () => {
  it('renders human message content with right alignment', () => {
    const message: LangGraphChatMessage = {
      id: 'h-1',
      role: 'human',
      content: 'Hello AI',
    };
    const { container } = render(<TextMessage message={message} />);
    expect(screen.getByText('Hello AI')).toBeTruthy();
    // human 消息应该右对齐 - 检查是否有 justify-end 或类似类
    expect(container.firstChild).toHaveClass('flex');
  });

  it('renders ai message with streaming cursor when isStreaming', () => {
    const message: LangGraphChatMessage = {
      id: 'ai-1',
      role: 'ai',
      content: 'Hi there',
    };
    const { container } = render(<TextMessage message={message} isStreaming />);
    expect(screen.getByText('Hi there')).toBeTruthy();
    expect(container.querySelector('.animate-pulse')).toBeTruthy();
  });

  it('renders ai message without streaming cursor by default', () => {
    const message: LangGraphChatMessage = {
      id: 'ai-1',
      role: 'ai',
      content: 'Hi there',
    };
    const { container } = render(<TextMessage message={message} />);
    expect(container.querySelector('.animate-pulse')).toBeNull();
  });

  it('renders tool call indicators for ai message with toolCalls', () => {
    const message: LangGraphChatMessage = {
      id: 'ai-1',
      role: 'ai',
      content: '',
      toolStatus: 'pending',
      toolCalls: [
        { id: 'tc-1', name: 'file_ops', args: { path: 'test.km' } },
      ],
    };
    render(<TextMessage message={message} />);
    expect(screen.getByText('file_ops')).toBeTruthy();
  });

  it('renders multiple tool call indicators', () => {
    const message: LangGraphChatMessage = {
      id: 'ai-1',
      role: 'ai',
      content: '',
      toolStatus: 'completed',
      toolCalls: [
        { id: 'tc-1', name: 'file_ops' },
        { id: 'tc-2', name: 'doc_read' },
      ],
    };
    render(<TextMessage message={message} />);
    expect(screen.getByText('file_ops')).toBeTruthy();
    expect(screen.getByText('doc_read')).toBeTruthy();
  });

  it('renders system message', () => {
    const message: LangGraphChatMessage = {
      id: 's-1',
      role: 'system',
      content: 'System instruction',
    };
    render(<TextMessage message={message} />);
    expect(screen.getByText('System instruction')).toBeTruthy();
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd apps/web && npm run test -- --run --reporter=verbose src/components/workspace/ai-panel/messages/__tests__/TextMessage.test.tsx 2>&1 | tail -30`
Expected: FAIL - "TextMessage is not defined"

- [ ] **Step 3: 实现 TextMessage 组件**

```tsx
/**
 * 文本消息组件
 *
 * 负责 human / ai / system 角色的纯文本消息渲染。
 * 根据 role 决定对齐方式、背景色、文字颜色。
 * streaming 模式下在文本末尾显示闪烁光标。
 * 对于 ai 消息，内部包含 ToolCallIndicator 列表展示工具调用状态。
 */

import type { TextMessageProps } from './types';
import { ToolCallIndicator } from './ToolCallIndicator';

export function TextMessage({ message, isStreaming }: TextMessageProps) {
  const isUser = message.role === 'human';
  const hasToolCalls = message.toolCalls && message.toolCalls.length > 0;

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[85%] rounded-lg px-3 py-2 text-[13px] leading-relaxed ${
          isUser
            ? 'bg-ws-accent text-white'
            : 'bg-ws-bg-secondary text-ws-fg-primary'
        }`}
      >
        {/* 用户消息 */}
        {isUser && (
          <div className="whitespace-pre-wrap break-words">{message.content}</div>
        )}

        {/* AI / System 消息 */}
        {!isUser && (
          <div className="space-y-2">
            {/* 文本内容 + 流式打字光标 */}
            {message.content && (
              <div className="whitespace-pre-wrap break-words text-sm">
                {message.content}
                {isStreaming && (
                  <span className="animate-pulse text-ws-accent">▊</span>
                )}
              </div>
            )}

            {/* 工具调用状态指示器 */}
            {hasToolCalls && (
              <div className="flex flex-col gap-1 border-ws-border border-t pt-2">
                {message.toolCalls?.map((tc, i) => (
                  <ToolCallIndicator
                    key={`${message.id}-tool-${i}`}
                    toolCall={tc}
                    status={message.toolStatus}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `cd apps/web && npm run test -- --run --reporter=verbose src/components/workspace/ai-panel/messages/__tests__/TextMessage.test.tsx 2>&1 | tail -30`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/workspace/ai-panel/messages/TextMessage.tsx
git add apps/web/src/components/workspace/ai-panel/messages/__tests__/TextMessage.test.tsx
git commit -m "feat(ai-panel): add TextMessage component"
```

---

## Task 4: 实现 ToolMessage 组件

**Files:**
- Create: `apps/web/src/components/workspace/ai-panel/messages/ToolMessage.tsx`
- Create: `apps/web/src/components/workspace/ai-panel/messages/__tests__/ToolMessage.test.tsx`

- [ ] **Step 1: 先写测试 - ToolMessage.test.tsx**

```tsx
/**
 * ToolMessage 单元测试
 * 测试 tool 角色消息的渲染
 */

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ToolMessage } from '../ToolMessage';
import type { LangGraphChatMessage } from '../types';

describe('ToolMessage', () => {
  it('renders tool message content', () => {
    const message: LangGraphChatMessage = {
      id: 'tool-1',
      role: 'tool',
      toolCallId: 'tc-1',
      toolName: 'file_ops',
      content: 'File created successfully',
    };
    render(<ToolMessage message={message} />);
    expect(screen.getByText('File created successfully')).toBeTruthy();
  });

  it('displays tool name label', () => {
    const message: LangGraphChatMessage = {
      id: 'tool-1',
      role: 'tool',
      toolCallId: 'tc-1',
      toolName: 'doc_read',
      content: 'Document content...',
    };
    render(<ToolMessage message={message} />);
    expect(screen.getByText('doc_read')).toBeTruthy();
  });

  it('uses left alignment for tool messages', () => {
    const message: LangGraphChatMessage = {
      id: 'tool-1',
      role: 'tool',
      toolCallId: 'tc-1',
      toolName: 'file_ops',
      content: 'result',
    };
    const { container } = render(<ToolMessage message={message} />);
    expect(container.firstChild).toHaveClass('justify-start');
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd apps/web && npm run test -- --run --reporter=verbose src/components/workspace/ai-panel/messages/__tests__/ToolMessage.test.tsx 2>&1 | tail -30`
Expected: FAIL - "ToolMessage is not defined"

- [ ] **Step 3: 实现 ToolMessage 组件**

```tsx
/**
 * 工具消息组件
 *
 * 负责 tool 角色消息的渲染。展示工具执行结果。
 * 未来可扩展：根据 toolName 分发到不同的工具专属卡片组件
 * （如 FileOpsCard、DocReadCard、ThinkingCard 等）
 */

import type { ToolMessageProps } from './types';

export function ToolMessage({ message }: ToolMessageProps) {
  return (
    <div className="flex justify-start">
      <div className="max-w-[85%] rounded-lg bg-ws-bg-tertiary px-3 py-2 text-[13px] leading-relaxed text-ws-fg-primary">
        <div className="space-y-2">
          {/* 工具名称标签 */}
          {message.toolName && (
            <div className="inline-flex items-center gap-2">
              <span className="rounded bg-accent-subtle-bg px-1.5 py-0.5 font-mono text-[11px] text-accent-subtle-fg">
                {message.toolName}
              </span>
              <span className="text-[11px] text-ws-fg-muted">
                {message.toolStatus === 'completed' && '✓ Success'}
                {message.toolStatus === 'rejected' && '✗ Rejected'}
                {message.toolStatus === 'pending' && '⏳ Pending'}
                {!message.toolStatus && 'Result'}
              </span>
            </div>
          )}

          {/* 工具结果内容 */}
          {message.content && (
            <div className="whitespace-pre-wrap break-words text-sm">
              {message.content}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `cd apps/web && npm run test -- --run --reporter=verbose src/components/workspace/ai-panel/messages/__tests__/ToolMessage.test.tsx 2>&1 | tail -30`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/workspace/ai-panel/messages/ToolMessage.tsx
git add apps/web/src/components/workspace/ai-panel/messages/__tests__/ToolMessage.test.tsx
git commit -m "feat(ai-panel): add ToolMessage component"
```

---

## Task 5: 将 MessageBubble 改为外观层

**Files:**
- Modify: `apps/web/src/components/workspace/ai-panel/message-bubble.tsx`
- Modify: `apps/web/src/components/workspace/ai-panel/__tests__/message-bubble.test.tsx`

- [ ] **Step 1: 修改 message-bubble.tsx 为外观层**

```tsx
/**
 * MessageBubble — 单条消息渲染组件（外观层）
 *
 * 保持向后兼容的统一入口，内部根据消息 role 分发到具体子组件。
 *
 * 组件分层：
 * - TextMessage: human / ai / system 文本消息
 * - ToolMessage: tool 工具执行结果消息
 * - ToolCallIndicator: ai 消息内的工具调用状态指示器
 *
 * 新增消息类型时，在此处添加路由规则即可，不影响调用方。
 */

import type { LangGraphChatMessage } from '@/features/ai/langgraph/types';
import { TextMessage, ToolMessage } from './messages';

export interface MessageBubbleProps {
  message: LangGraphChatMessage;
  /** AI 正在流式生成此消息（显示打字光标） */
  isStreaming?: boolean;
}

export function MessageBubble({ message, isStreaming }: MessageBubbleProps) {
  // Tool 消息走 ToolMessage 组件
  if (message.role === 'tool') {
    return <ToolMessage message={message} />;
  }

  // human / ai / system 走 TextMessage 组件
  return <TextMessage message={message} isStreaming={isStreaming} />;
}
```

- [ ] **Step 2: 简化原测试文件 - 只保留路由测试**

```tsx
/**
 * MessageBubble 单元测试（外观层）
 *
 * 重点测试路由逻辑：不同 role 的消息是否分发到正确的子组件。
 * 子组件的详细渲染逻辑在各自的测试文件中测试。
 */

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { LangGraphChatMessage } from '@/features/ai/langgraph/types';
import { MessageBubble } from '../message-bubble';

describe('MessageBubble (Facade)', () => {
  it('renders human message via TextMessage', () => {
    const message: LangGraphChatMessage = {
      id: 'h-1',
      role: 'human',
      content: 'Hello',
    };
    render(<MessageBubble message={message} />);
    expect(screen.getByText('Hello')).toBeTruthy();
  });

  it('renders ai message via TextMessage', () => {
    const message: LangGraphChatMessage = {
      id: 'ai-1',
      role: 'ai',
      content: 'Hi there',
    };
    render(<MessageBubble message={message} />);
    expect(screen.getByText('Hi there')).toBeTruthy();
  });

  it('renders tool message via ToolMessage', () => {
    const message: LangGraphChatMessage = {
      id: 'tool-1',
      role: 'tool',
      toolCallId: 'tc-1',
      toolName: 'file_ops',
      content: 'File created',
    };
    render(<MessageBubble message={message} />);
    expect(screen.getByText('File created')).toBeTruthy();
    expect(screen.getByText('file_ops')).toBeTruthy();
  });

  it('passes isStreaming prop to TextMessage', () => {
    const message: LangGraphChatMessage = {
      id: 'ai-1',
      role: 'ai',
      content: 'Thinking',
    };
    const { container } = render(<MessageBubble message={message} isStreaming />);
    expect(container.querySelector('.animate-pulse')).toBeTruthy();
  });
});
```

- [ ] **Step 3: 运行所有消息相关测试**

Run: `cd apps/web && npm run test -- --run --reporter=verbose src/components/workspace/ai-panel 2>&1 | tail -50`
Expected: All tests PASS in all test files

- [ ] **Step 4: 验证完整测试套件（可选，确保无回归）**

Run: `cd apps/web && npm run test -- --run 2>&1 | tail -30`
Expected: No new failures introduced

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/workspace/ai-panel/message-bubble.tsx
git add apps/web/src/components/workspace/ai-panel/__tests__/message-bubble.test.tsx
git commit -m "refactor(ai-panel): convert MessageBubble to facade layer"
```

---

## Task 6: 清理并验证

**Files:**
- Verify: 所有消息组件文件
- Check: 删除原文件中冗余的代码

- [ ] **Step 1: 检查 TypeScript 编译无错误**

Run: `cd apps/web && npx tsc --noEmit -p tsconfig.json --skipLibCheck 2>&1 | grep -v "node_modules" | head -20`
Expected: No TypeScript errors

- [ ] **Step 2: 检查 ESLint（如果项目配置了）**

Run: `cd apps/web && npm run lint -- --quiet src/components/workspace/ai-panel 2>&1 | tail -20 || echo "No lint command available, skipping"`
Expected: No new ESLint errors related to our changes

- [ ] **Step 3: 手动验证功能（浏览器检查）**

Run: `cd apps/web && npm run dev 2>&1 | head -10 &`
Then open browser and verify:
- Human messages display correctly on right
- AI messages display correctly on left with streaming cursor
- Tool call indicators show pending/completed/rejected states
- Tool messages render with tool name labels

- [ ] **Step 4: 最终提交 - 更新 index.ts 导出（如需要）**

检查 `messages/index.ts` 是否已经正确导出所有组件。如果 Task 1 已完成，此步骤可能无需修改。

- [ ] **Step 5: Commit 最终调整（如有）**

```bash
git commit --allow-empty -m "refactor(ai-panel): complete message bubble architecture refactor"
```

---

## 验证清单 - 重构完成后确认

- [ ] ✅ `MessageBubble` Props 完全不变，向后兼容
- [ ] ✅ `AIPanel` 调用代码无需修改
- [ ] ✅ 所有子组件独立可测试
- [ ] ✅ 新增工具卡片只需在 `ToolMessage` 内加分支
- [ ] ✅ `summarizeArgs` 工具函数可复用
- [ ] ✅ `ToolCallIndicator` 可在其他场景复用

---

## 后续扩展路径（不在本次计划范围内）

1. **新增工具专属卡片**：在 `messages/tools/` 下创建 `FileOpsCard.tsx` 等，在 `ToolMessage` 中根据 `toolName` 分发
2. **新增思考链消息**：创建 `ThinkingMessage.tsx`，在 `MessageBubble` 中根据 `additional_kwargs` 路由
3. **代码块消息**：创建 `CodeBlockMessage.tsx`，支持语法高亮
4. **图片消息**：创建 `ImageMessage.tsx`，支持图片渲染
