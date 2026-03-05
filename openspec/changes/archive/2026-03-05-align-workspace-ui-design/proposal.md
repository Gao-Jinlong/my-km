## Why

当前工作空间 UI 实现与设计稿 (docs/designs/my-km.pen) 存在多处差异，需要对照设计稿进行对齐。本变更采用**视觉截图对比**方法，使用 Pencil MCP 获取设计稿截图，使用 Playwright/Chrome DevTools 获取实现截图，系统性地识别和修复差异。

## What Changes

- **顶部导航栏 (TopNav)**: 调整图标尺寸、间距和视觉样式，对齐设计稿中的深色/浅色主题
- **Activity Bar**: 修改图标样式（设计稿使用 40x40 圆角背景 + 20px 图标），增加选中状态的视觉反馈
- **侧边栏面板 (Sidebar Panel)**: 调整面板标题高度、字体大小和间距
- **文件树 (FileTree)**: 优化文件/文件夹项的图标、间距和选中/悬停状态样式
- **编辑器标签页 (EditorTabs)**: 使用文件图标替代占位符，优化标签页关闭按钮样式
- **AI 面板 (AIPanel)**: 添加示例对话内容，优化聊天气泡样式和输入区域设计
- **状态栏 (StatusBar)**: 对齐图标尺寸和间距
- **主题系统**: 确保深色/浅色主题颜色变量与设计稿一致

## Capabilities

### New Capabilities

- `workspace-dark-theme`: 工作空间深色主题完整实现
- `workspace-light-theme`: 工作空间浅色主题完整实现
- `activity-bar-enhanced`: 增强的 Activity Bar 组件，包含选中状态背景
- `file-tree-component`: 完整的文件树组件，支持展开/折叠和选中状态
- `editor-tabs-enhanced`: 增强的编辑器标签页，包含文件图标和优化的关闭按钮
- `ai-chat-ui`: AI 聊天气泡和输入区域的完整 UI 实现
- `visual-comparison-workflow`: 基于截图的视觉对比工作流

### Modified Capabilities

- `top-nav`: 调整图标尺寸和按钮样式以匹配设计稿

## Impact

- 受影响组件：TopNav, ActivityBar, FilesPanel, EditorTabs, AIPanel, StatusBar
- 主题变量：需确保 workspace 主题颜色变量与设计稿一致
- 依赖：无外部依赖变化
- **新增工具使用**: Pencil MCP (设计稿截图), Playwright/Chrome DevTools (实现截图)
