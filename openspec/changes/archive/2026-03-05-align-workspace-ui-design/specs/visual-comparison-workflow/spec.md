## ADDED Requirements

### Requirement: Visual Comparison Workflow
系统应支持基于截图的视觉对比工作流，用于识别设计稿与代码实现之间的差异。

#### Scenario: Design screenshot capture
- **WHEN** 需要对比设计稿
- **THEN** 应能使用 Pencil MCP 的 `get_screenshot` 工具获取设计稿指定节点的截图

#### Scenario: Implementation screenshot capture
- **WHEN** 需要对比实现效果
- **THEN** 应能使用 Playwright 或 Chrome DevTools 捕获浏览器中的实际渲染截图

#### Scenario: Side-by-side comparison
- **WHEN** 获取设计稿和实现截图后
- **THEN** 应能并排展示两张截图，识别视觉差异

#### Scenario: Component-level comparison
- **WHEN** 对比特定组件 (如 TopNav, Activity Bar, FileTree 等)
- **THEN** 应能获取设计稿对应组件的截图并与实现对比

#### Scenario: Theme comparison
- **WHEN** 对比深色/浅色主题
- **THEN** 应分别获取两种主题的截图进行对比

#### Scenario: Post-fix verification
- **WHEN** 修复视觉差异后
- **THEN** 应重新截图验证对齐效果
