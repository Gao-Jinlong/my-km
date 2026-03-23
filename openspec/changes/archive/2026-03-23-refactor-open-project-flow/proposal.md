## Why

当前工作区缺少"打开项目"的用户交互流程，文件系统服务已经实现但未被集成到 UI 中。用户无法通过界面选择并打开项目目录，导致文件系统功能无法被使用。本变更将实现完整的项目打开流程，包括欢迎页面、项目选择器和项目状态管理。

## What Changes

- 新增项目管理器 (ProjectManager) 负责管理当前打开的项目状态和生命周期
- 新增欢迎页面组件，在无项目打开时显示，提供"打开项目"入口
- 新增项目选择器组件，使用 File System Access API 让用户选择项目目录
- 重构 workspace page，根据是否有打开的项目动态显示欢迎页或工作区
- 集成 fileSystemService 到项目打开流程，自动注册并使用 fs-access-provider
- 项目切换时自动清理旧项目的文件句柄缓存

## Capabilities

### New Capabilities

- `project-manager`: 项目管理器，负责项目打开/关闭/切换的生命周期管理和状态持久化
- `open-project-ui`: 项目打开 UI 组件，包括欢迎页面和项目选择器对话框
- `project-store`: 项目状态 Store，管理当前项目信息和文件树缓存

### Modified Capabilities

- `file-system-service`: 增加项目级别的生命周期钩子，在项目关闭时自动清理缓存

## Impact

- **依赖**:
  - `file-system-service`: 已实现的 FileSystemService 和 fs-access-provider
  - `workspace-store`: 现有工作区状态管理
  - File System Access API (Chromium 浏览器)
- **影响组件**:
  - `workspace/page.tsx`: 增加项目打开状态判断逻辑
  - `workspace/layout.tsx`: 可能需要调整以支持欢迎页
- **新增组件**:
  - `components/project/welcome.tsx`: 欢迎页面
  - `components/project/project-picker.tsx`: 项目选择器
  - `components/project/project-manager.tsx`: 项目管理器
