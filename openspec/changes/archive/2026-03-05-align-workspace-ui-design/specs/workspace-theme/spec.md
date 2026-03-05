## ADDED Requirements

### Requirement: Workspace Dark Theme
系统应实现工作空间深色主题，与设计稿中的"Workspace"设计完全一致。

#### Scenario: Dark theme colors applied
- **WHEN** 用户选择深色主题
- **THEN** 所有组件颜色变量应切换为深色主题值

#### Scenario: TopNav dark styling
- **WHEN** 深色主题激活
- **THEN** TopNav 背景应为 `$bgPrimary` (#181818)，边框为 `$border` (#333333)

#### Scenario: Activity Bar dark styling
- **WHEN** 深色主题激活
- **THEN** Activity Bar 按钮选中状态背景应为 `$accent` (#58A6FF)

### Requirement: Workspace Light Theme
系统应实现工作空间浅色主题，与设计稿中的"Workspace Light"设计完全一致。

#### Scenario: Light theme colors applied
- **WHEN** 用户选择浅色主题
- **THEN** 所有组件颜色变量应切换为浅色主题值

#### Scenario: TopNav light styling
- **WHEN** 浅色主题激活
- **THEN** TopNav 背景应为 `$bgPrimary_Light` (#FFFFFF)，边框为 `$border_Light` (#D0D7DE)

#### Scenario: Activity Bar light styling
- **WHEN** 浅色主题激活
- **THEN** Activity Bar 按钮选中状态背景应为 `$accent_Light` (#0969DA)
