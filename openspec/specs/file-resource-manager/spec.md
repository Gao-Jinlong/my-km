# file-resource-manager Specification

## Purpose
TBD - created by archiving change file-system-service. Update Purpose after archive.
## Requirements
### Requirement: 跟踪活动文件资源
系统 SHALL 支持跟踪当前打开的所有文件资源。

#### Scenario: 注册活动文件
- **WHEN** 用户打开一个文件
- **THEN** 系统将文件资源添加到活动资源列表中

#### Scenario: 注销活动文件
- **WHEN** 用户关闭一个文件
- **THEN** 系统从活动资源列表中移除该文件

### Requirement: 管理文件资源生命周期
系统 SHALL 支持管理文件资源的生命周期。

#### Scenario: 资源自动清理
- **WHEN** 文件资源管理器被释放
- **THEN** 系统自动释放所有注册的文件资源

#### Scenario: 手动释放资源
- **WHEN** 调用资源释放方法
- **THEN** 系统释放指定的文件资源

### Requirement: 防止资源泄漏
系统 SHALL 确保所有打开的文件资源都能被正确释放。

#### Scenario: 项目关闭时清理
- **WHEN** 用户关闭项目
- **THEN** 系统释放该项目相关的所有文件资源

#### Scenario: 页面卸载时清理
- **WHEN** 页面或应用关闭
- **THEN** 系统释放所有已注册的文件资源

### Requirement: 资源状态查询
系统 SHALL 支持查询文件资源的当前状态。

#### Scenario: 检查资源是否打开
- **WHEN** 查询某个文件是否已打开
- **THEN** 系统返回该文件的打开状态

#### Scenario: 获取活动资源列表
- **WHEN** 请求获取所有活动文件资源
- **THEN** 系统返回当前所有活动文件的列表

### Requirement: 集成 Disposable 模式
系统 SHALL 遵循项目的 Disposable 模式进行资源管理。

#### Scenario: 实现 IDisposable 接口
- **WHEN** 文件资源管理器被创建
- **THEN** 它实现 IDisposable 接口并支持 dispose() 方法

#### Scenario: 使用 DisposableStore 管理依赖
- **WHEN** 文件资源管理器注册依赖资源
- **THEN** 使用 DisposableStore 统一管理依赖的生命周期

