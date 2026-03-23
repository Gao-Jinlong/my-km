# open-project-ui Specification

## Purpose

定义项目打开 UI 组件的行为规范，包括欢迎页面和项目选择器对话框。

## ADDED Requirements

### Requirement: 欢迎页面显示

系统 SHALL 在无项目打开时显示欢迎页面。

#### Scenario: 初始加载无项目
- **WHEN** 用户首次访问工作区且无历史项目
- **THEN** 系统显示欢迎页面包含"打开项目"按钮

#### Scenario: 项目关闭后
- **WHEN** 用户关闭当前项目
- **THEN** 系统从工作区视图切换到欢迎页面

#### Scenario: 欢迎页面内容
- **WHEN** 欢迎页面显示时
- **THEN** 展示应用名称、简短说明和"打开项目"按钮

### Requirement: 项目选择器对话框

系统 SHALL 提供一个对话框用于用户选择项目目录。

#### Scenario: 打开对话框
- **WHEN** 用户点击"打开项目"按钮
- **THEN** 系统显示项目选择器对话框

#### Scenario: 选择目录
- **WHEN** 用户在对话框中选择一个文件夹
- **THEN** 系统调用 File System Access API 的 `showDirectoryPicker()`

#### Scenario: 关闭对话框
- **WHEN** 用户点击取消或选择外部区域
- **THEN** 系统关闭对话框且不执行任何操作

### Requirement: 项目选择器错误处理

系统 SHALL 友好地处理项目选择过程中的错误。

#### Scenario: 用户取消选择
- **WHEN** 用户在文件选择器中点击取消
- **THEN** 系统不显示错误，静默关闭对话框

#### Scenario: 权限被拒绝
- **WHEN** 用户拒绝目录访问权限
- **THEN** 系统显示提示信息说明需要权限原因

#### Scenario: 浏览器不支持
- **WHEN** 用户使用不支持 File System Access API 的浏览器
- **THEN** 系统显示降级提示并提供替代方案

### Requirement: 加载状态反馈

系统 SHALL 在打开项目过程中显示加载状态。

#### Scenario: 正在打开项目
- **WHEN** 用户选择目录后
- **THEN** 系统显示加载指示器（spinner 或进度条）

#### Scenario: 打开成功
- **WHEN** 项目成功打开
- **THEN** 系统隐藏加载指示器并切换到工作区视图

#### Scenario: 打开失败
- **WHEN** 打开项目过程中发生错误
- **THEN** 系统显示错误信息并提供重试选项

### Requirement: 工作区视图切换

系统 SHALL 根据项目状态在欢迎页和工作区之间切换。

#### Scenario: 有项目时显示工作区
- **WHEN** `projectManager.hasOpenProject()` 返回 true
- **THEN** 系统显示工作区视图（sidebar + editor）

#### Scenario: 无项目时显示欢迎页
- **WHEN** `projectManager.hasOpenProject()` 返回 false
- **THEN** 系统显示欢迎页面
