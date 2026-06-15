# LangGraph Chat Runtime

前端 AI 对话链路统一执行 LangGraph Platform/SSE 协议。

## 边界

- `apps/web/src/features/ai/langgraph/` 是前端 AI 消息处理的唯一 runtime 层。
- runtime 使用 `@langchain/langgraph-sdk` 普通 `Client` 消费 `/api/threads/:threadId/runs/stream`。
- React 组件不处理业务事件，不监听 message/interrupt 推动后续流程，只订阅 runtime snapshot 并渲染。
- 旧的自建 `ClientMessage` / `ServerMessage` / Socket.io 事件协议已从前端消息链路移除。

## 数据流

```
AIPanel
  -> useLangGraphStream()
  -> LangGraphChatRuntime
  -> LangGraph Client runs.stream()
  -> SSE events: metadata / messages / values / tasks / error
  -> runtime snapshot
  -> React render
```

## 工具调用

LangGraph `tasks` 事件中的 `interrupts` 由 `LangGraphChatRuntime` 处理：

1. 解析 `value.tool_call_id` / `value.tool_name` / `value.args`。
2. 通过 `FrontendToolExecutor.dispatch()` 执行前端工具。
3. 使用 LangGraph `command.resume` 回传：

```ts
{
  input: null,
  command: {
    resume: {
      tool_call_id: toolCallId,
      tool_result: result
    }
  }
}
```

UI 只订阅工具确认请求并展示确认弹窗。
