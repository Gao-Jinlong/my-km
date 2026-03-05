## ADDED Requirements

### Requirement: AI Chat UI Component
AI 聊天组件应实现完整的聊天气泡和输入区域样式。

#### Scenario: User message appearance
- **WHEN** 显示用户消息
- **THEN** 消息文字颜色应为 `$fgPrimary`，无背景

#### Scenario: AI message appearance
- **WHEN** 显示 AI 回复消息
- **THEN** 消息应有背景色 `$bgTertiary`，padding 为 12px，文字颜色为 `$fgPrimary`

#### Scenario: Chat area spacing
- **WHEN** 显示多条消息
- **THEN** 消息之间的间距应为 16px

#### Scenario: Input area appearance
- **WHEN** 渲染输入区域
- **THEN** 输入框背景应为 `$bgSecondary`，placeholder 颜色为 `$fgMuted`

#### Scenario: Input area border
- **WHEN** 渲染输入区域顶部
- **THEN** 应显示顶部边框，颜色为 `$border`

#### Scenario: Send button
- **WHEN** 渲染发送按钮
- **THEN** 按钮应显示 Send 图标，尺寸为 18x18
