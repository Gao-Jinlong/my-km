# 文档目录

> **入口文档**: 请阅读根目录 [AGENTS.md](../AGENTS.md)，按场景索引加载对应文档。

---

本目录包含项目所有模块文档，按以下结构组织：

```
docs/
├── architecture/           # 系统架构
│   └── overview.md         #   系统架构概览
├── frontend/               # 前端架构
│   ├── architecture.md     #   前端模块架构
│   ├── frontend-chat-refactor-plan.md  # 对话模块重构方案（进行中）
│   └── platform/
│       └── services.md     #   Platform DI 服务层
├── backend/                # 后端架构
│   ├── architecture.md     #   后端模块概览
│   ├── ai-architecture-v2.md  # AI 后端架构 (LLM + LangGraph)
│   └── llm-integration-guide.md  # LLM 对话流程前端对接文档
├── guides/                 # 开发指南和参考
│   ├── code-style.md       #   代码风格
│   ├── debug-with-handoff.md
│   ├── dev-setup.md        #   开发环境配置
│   ├── file-search-shortcut.md
│   ├── file-system-uri.md
│   ├── keyboard-shortcut-enums.md
│   └── workflow.md         #   工作流程
├── plans/                  # 活跃实施计划
│   ├── 2026-05-19-ai-backend-architecture.md
│   ├── 2026-05-19-ai-backend-rewrite-plan.md
│   └── archived/           #   已完成/过期的计划（历史存档）
├── superpowers/plans/      # Superpowers 生成的计划
│   └── archived/           #   已完成的计划（历史存档）
├── design-system/          # 设计系统（Pencil 设计稿）
├── ai-backend-architecture.md  # ⚠️ 已归档 — 2026-05-06 重构设计稿，被 backend/ai-architecture-v2 替代
├── ai-conversation-flow.md     # AI 对话流程 Mermaid 图
└── tech-debt.md            # 技术债务追踪
```

**最后更新**: 2026-05-22
