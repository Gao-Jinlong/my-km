# 变更日志

所有重要的项目变更都将记录在此文件中。

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
