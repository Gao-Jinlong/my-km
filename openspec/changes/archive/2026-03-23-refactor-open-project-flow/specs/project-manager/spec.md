# project-manager Specification

## Purpose

定义项目管理器的职责和行为规范，负责项目打开/关闭/切换的生命周期管理。

## ADDED Requirements

### Requirement: 项目打开流程

系统 SHALL 支持用户通过 UI 选择并打开一个项目目录。

#### Scenario: 用户选择项目目录
- **WHEN** 用户点击"打开项目"按钮
- **THEN** 系统调用 File System Access API 显示目录选择器

#### Scenario: 成功打开项目
- **WHEN** 用户选择一个有效的目录
- **THEN** 系统注册 fs-access-provider 并更新项目状态为"已打开"

#### Scenario: 用户取消选择
- **WHEN** 用户在目录选择器中点击取消
- **THEN** 系统不改变当前项目状态，保持欢迎页面

### Requirement: 项目关闭流程

系统 SHALL 支持用户关闭当前打开的项目并释放资源。

#### Scenario: 用户主动关闭项目
- **WHEN** 用户触发关闭项目操作
- **THEN** 系统调用 projectManager.close() 释放所有相关资源

#### Scenario: 资源释放
- **WHEN** 关闭项目时
- **THEN** 系统释放该项目的文件句柄缓存并注销 provider

#### Scenario: 状态重置
- **WHEN** 项目关闭完成后
- **THEN** 系统重置项目状态为 null 并显示欢迎页面

### Requirement: 项目切换流程

系统 SHALL 支持用户从一个项目切换到另一个项目。

#### Scenario: 切换到新项目
- **WHEN** 用户打开一个不同于当前项目的新目录
- **THEN** 系统先关闭当前项目，然后打开新项目

#### Scenario: 切换中间状态
- **WHEN** 项目切换过程中
- **THEN** 系统先清理旧项目资源，再注册新项目资源

### Requirement: 项目状态查询

系统 SHALL 提供当前项目状态的查询接口。

#### Scenario: 获取当前项目
- **WHEN** 调用 `projectManager.getCurrentProject()`
- **THEN** 返回当前打开的项目信息或 null

#### Scenario: 检查是否有打开的项目
- **WHEN** 调用 `projectManager.hasOpenProject()`
- **THEN** 返回布尔值表示是否有项目处于打开状态

### Requirement: Provider 生命周期管理

系统 SHALL 在项目打开时自动注册 Provider，在关闭时自动注销。

#### Scenario: 注册 fs-access-provider
- **WHEN** 打开项目时
- **THEN** 系统创建并注册 FileSystemAccessAPIProvider 到 fileSystemService

#### Scenario: 清理 provider 缓存
- **WHEN** 关闭项目时
- **THEN** 系统清理 fs-access-provider 的句柄缓存

### Requirement: 项目持久化

系统 SHALL 支持在页面刷新后恢复项目状态。

#### Scenario: 刷新页面后恢复
- **WHEN** 页面刷新完成
- **THEN** 系统尝试从 IndexedDB 恢复项目目录句柄

#### Scenario: 句柄失效处理
- **WHEN** 存储的句柄失效（如文件被移动）
- **THEN** 系统显示错误提示并引导用户重新选择项目
