# 变更日志

所有重要的项目变更都将记录在此文件中。

## [0.2.0] - 2026-05-11

### Added
- **AI 模块架构重构** — 多 LLM 协作 + LangGraph 工作流引擎
  - LLM 抽象层：`LLMProvider` 接口 + `LLMFactory` 按需实例化 + `ProviderRegistry` 运行时注册
  - 支持 Anthropic、OpenAI、智谱 AI 三种 Provider
  - 工作流运行时：`ConversationOrchestrator` + `WorkflowExecutor` + `LLMResolver`
  - LangGraph 隔离包：`packages/langgraph-workflows/`，纯函数式代码无 NestJS 依赖
  - 节点级 LLM 路由：工作流中每个节点可独立指定 LLM
  - WebSocket 网关支持传递 `llmConfigMap` 和 `graphName`
  - 架构文档：`docs/backend/ai-architecture-v2.md`（该文档已废弃，现行协议见 `docs/superpowers/specs/2026-06-15-llm-conversation-protocol-design.md`）

### Changed
- **LangGraph 节点实现** — 节点处理器从占位实现改为实际 LLM 调用逻辑
  - `llm-node.ts`：通过 configurable.llmCaller 注入 LLM 调用函数，处理流式输出
  - `tool-node.ts`：处理工具结果，清空 pendingToolCalls
  - `chat-graph.ts`：使用 addConditionalEdges 根据 hasToolCalls 条件路由
- **WorkflowExecutor** — 实现完整执行流程：LLMCaller 闭包创建 + 工具调用外层循环 + 流式输出推送
- **遗留代码清理** — 删除 ai-loop.orchestrator.ts、provider.router.ts、ai.gateway.ts 等 5 个文件

## [0.1.0] - 2026-03-30

### Added
- **编辑器核心功能**
  - 富文本编辑器 MVP（基于 Lexical 0.39）
  - BlockRegistry 块类型注册中心（8 种基础块类型）
  - EditorService 和 EditorContainer 编辑器管理
  - AutoSaveService 自动保存服务（防抖逻辑）
  - AIContextService AI 上下文采集服务

- **基础设施服务**
  - 命令中心（CommandService）
  - 消息通道服务（MessageChannelService）
  - 事件总线服务（EventBusService）
  - 持久化存储服务（StorageService）
  - 前端日志服务（LoggerService）

- **用户界面**
  - 工作视图（WorkspaceView）
  - 编辑器标签页系统（EditorTabs）
  - 文件树和文件面板
  - 快捷键系统（Ctrl+W, Ctrl+S, Ctrl+P 等）
  - 右键菜单扩展（编辑器区域支持）

- **路由和导航**
  - 项目选择流程修复
  - 文件路径作为文档 ID（防止重复打开）

### Changed
- 统一使用 ServiceBase 基类重构服务
- AutoSaveService 接口更新为使用 FileSystemService

### Fixed
- 标签页重复打开问题（使用文件路径作为 ID）
- workspace 页面默认进入问题（检查 rootHandle 有效性）
- 测试文件中的 destroy/dispose 调用

### Technical
- 添加 293 个测试用例（单元测试 + 集成测试 + E2E）
- 实现 Dispose 模式规范（基于 VSCode 生命周期管理）

---

## 版本说明

### 版本号规则

- **PATCH** (0.0.X) - Bug 修复和小改进
- **MINOR** (0.X.0) - 新功能和重大改进
- **MAJOR** (X.0.0) - 突破性变更

### 归档说明

早期开发版本的详细变更记录保存在：
- `docs/implementation-summary-2026-03-30.md` - 前端迭代实施总结
- `docs/development/2026-03-25-rich-text-editor.md` - 富文本编辑器开发记录
- `docs/superpowers/plans/` - Superpowers 实施计划

---

**格式参考**: [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)
