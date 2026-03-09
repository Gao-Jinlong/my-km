# file-handle-cache Specification

## Purpose
TBD - created by archiving change file-system-service. Update Purpose after archive.
## Requirements
### Requirement: 存储文件句柄
系统 SHALL 支持将 FileSystemFileHandle 和 FileSystemDirectoryHandle 存储到 IndexedDB 中。

#### Scenario: 存储文件句柄
- **WHEN** 用户选择一个文件
- **THEN** 系统将该文件的句柄以唯一 key 存储到 IndexedDB

#### Scenario: 存储目录句柄
- **WHEN** 用户选择一个文件夹
- **THEN** 系统将该文件夹的句柄以唯一 key 存储到 IndexedDB

### Requirement: 检索文件句柄
系统 SHALL 支持从 IndexedDB 中检索已存储的文件句柄。

#### Scenario: 通过 key 检索句柄
- **WHEN** 系统需要使用已缓存的文件句柄
- **THEN** 系统能够通过 key 从 IndexedDB 检索到对应的句柄

#### Scenario: 句柄不存在
- **WHEN** 使用不存在的 key 检索句柄
- **THEN** 系统返回 null 或 undefined

### Requirement: 删除文件句柄
系统 SHALL 支持删除指定的已缓存句柄。

#### Scenario: 删除单个句柄
- **WHEN** 用户关闭某个文件
- **THEN** 系统能够从 IndexedDB 删除该文件的句柄

#### Scenario: 批量删除句柄
- **WHEN** 用户关闭整个项目
- **THEN** 系统能够删除该项目相关的所有句柄

### Requirement: 按项目隔离句柄
系统 SHALL 支持按项目 ID 组织和隔离文件句柄。

#### Scenario: 存储项目目录句柄
- **WHEN** 用户打开一个项目
- **THEN** 系统以项目 ID 为 key 存储项目根目录句柄

#### Scenario: 存储项目内文件句柄
- **WHEN** 用户打开项目内的文件
- **THEN** 系统以 `{projectId}:{relativePath}` 为 key 存储文件句柄

### Requirement: 验证句柄有效性
系统 SHALL 支持验证缓存的文件句柄是否仍然有效。

#### Scenario: 有效句柄验证
- **WHEN** 检索到一个缓存的句柄
- **THEN** 系统能够通过查询句柄的 kind 属性验证其有效性

#### Scenario: 失效句柄处理
- **WHEN** 用户移动或删除了文件后访问缓存句柄
- **THEN** 系统能够检测到句柄失效并返回相应错误

