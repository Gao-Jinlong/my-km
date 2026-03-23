# project-store Specification

## Purpose

定义项目状态的 Store 规范，管理当前项目信息和文件树缓存。

## ADDED Requirements

### Requirement: 项目状态数据结构

系统 SHALL 定义项目状态的数据结构。

#### Scenario: 项目信息接口
- **WHEN** 定义 ProjectInfo 类型
- **THEN** 包含 id、name、rootHandle、openedAt 字段

#### Scenario: 项目状态接口
- **WHEN** 定义 ProjectState 类型
- **THEN** 包含 currentProject、isOpen、loading 字段

### Requirement: 项目状态初始化

系统 SHALL 正确初始化项目状态。

#### Scenario: 初始状态
- **WHEN** 应用首次加载
- **THEN** 项目状态为 null 或从 localStorage 恢复

#### Scenario: 从持久化存储恢复
- **WHEN** 存在持久化的项目状态
- **THEN** 系统尝试恢复项目信息

### Requirement: 项目状态更新操作

系统 SHALL 提供项目状态更新的操作方法。

#### Scenario: 设置当前项目
- **WHEN** 调用 `setCurrentProject(projectInfo)`
- **THEN** 更新 currentProject 字段并设置 isOpen 为 true

#### Scenario: 清除项目状态
- **WHEN** 调用 `clearCurrentProject()`
- **THEN** 将 currentProject 设为 null 并设置 isOpen 为 false

#### Scenario: 设置加载状态
- **WHEN** 调用 `setLoading(true/false)`
- **THEN** 更新 loading 字段

### Requirement: 项目状态持久化

系统 SHALL 持久化项目状态到 localStorage。

#### Scenario: 项目打开后持久化
- **WHEN** 用户成功打开项目
- **THEN** 系统将项目信息保存到 localStorage

#### Scenario: 项目关闭后清理
- **WHEN** 用户关闭项目
- **THEN** 系统清除 localStorage 中的项目信息

#### Scenario: 页面刷新后恢复
- **WHEN** 页面刷新
- **THEN** 系统从 localStorage 恢复项目状态

### Requirement: 项目状态选择器

系统 SHALL 提供项目状态查询的选择器方法。

#### Scenario: 获取当前项目
- **WHEN** 调用 `selectCurrentProject()`
- **THEN** 返回当前项目信息或 undefined

#### Scenario: 检查项目是否打开
- **WHEN** 调用 `selectIsProjectOpen()`
- **THEN** 返回布尔值

#### Scenario: 获取加载状态
- **WHEN** 调用 `selectIsLoading()`
- **THEN** 返回当前加载状态

### Requirement: 文件树缓存

系统 SHALL 缓存已访问的文件和目录句柄。

#### Scenario: 缓存文件句柄
- **WHEN** 用户打开一个文件
- **THEN** 系统将该文件句柄加入缓存

#### Scenario: 获取缓存句柄
- **WHEN** 用户访问已缓存的文件
- **THEN** 系统直接从缓存返回句柄

#### Scenario: 清理缓存
- **WHEN** 项目关闭时
- **THEN** 系统清空所有文件句柄缓存
