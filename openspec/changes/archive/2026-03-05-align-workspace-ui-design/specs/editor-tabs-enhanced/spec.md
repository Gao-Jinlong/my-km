## ADDED Requirements

### Requirement: Editor Tabs Enhanced Styling
编辑器标签页组件应实现增强的视觉样式，包括文件图标、优化的标签页关闭按钮。

#### Scenario: Active tab appearance
- **WHEN** 标签页处于激活状态
- **THEN** 背景色应为 `$bgSecondary`，文字颜色为 `$fgPrimary`

#### Scenario: Inactive tab appearance
- **WHEN** 标签页处于非激活状态
- **THEN** 文字颜色应为 `$fgMuted`，无背景

#### Scenario: File icon display
- **WHEN** 渲染标签页
- **THEN** 应显示 FileText 图标 (14x14) 在文字左侧

#### Scenario: Close button visibility
- **WHEN** 用户悬停在标签页上
- **THEN** 关闭按钮 (X 图标) 应变为可见

#### Scenario: Close button hover
- **WHEN** 用户悬停在关闭按钮上
- **THEN** 按钮背景应变为 `$bgTertiary`

#### Scenario: Tab separator
- **WHEN** 多个标签页并排显示
- **THEN** 标签页之间应有右侧边框分隔
