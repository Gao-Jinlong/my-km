## ADDED Requirements

### Requirement: Activity Bar Enhanced Styling
Activity Bar 组件应实现增强的视觉样式，包括 40x40 圆角背景和清晰的选中状态。

#### Scenario: Default icon appearance
- **WHEN** 图标未被选中
- **THEN** 图标应显示为 20x20 尺寸，无背景，颜色为 `$fgMuted`

#### Scenario: Selected icon appearance
- **WHEN** 图标被选中
- **THEN** 图标应被包裹在 40x40 圆角 (8px) 容器中，背景色为 `$accent`

#### Scenario: Hover state
- **WHEN** 用户悬停在图标上
- **THEN** 图标背景应变为 `$bgTertiary`

#### Scenario: Icon spacing
- **WHEN** 多个图标垂直排列
- **THEN** 图标之间的间距应为 8px
