## ADDED Requirements

### Requirement: File Tree Component
文件树组件应实现完整的视觉样式，包括文件夹/文件图标、缩进、选中/悬停状态。

#### Scenario: Folder item appearance
- **WHEN** 渲染文件夹项
- **THEN** 应显示 Library 图标 (16x16) + 文件夹名称，颜色为 `$fgPrimary`

#### Scenario: File item appearance
- **WHEN** 渲染文件项
- **THEN** 应显示 FileText 图标 (16x16) + 文件名称，颜色为 `$fgPrimary`

#### Scenario: File item indentation
- **WHEN** 文件位于文件夹内
- **THEN** 文件项应有额外的 16px 左缩进

#### Scenario: Selected state
- **WHEN** 文件/文件夹被选中
- **THEN** 背景色应变为 `$bgTertiary`

#### Scenario: Hover state
- **WHEN** 用户悬停在文件/文件夹上
- **THEN** 背景色应变为 `$bgTertiary`

#### Scenario: Folder expand/collapse
- **WHEN** 点击文件夹
- **THEN** 应显示 ChevronDown(展开) 或 ChevronRight(折叠) 图标
