## ADDED Requirements

### Requirement: FileSystemService 核心服务

系统 SHALL 实现 FileSystemService 作为统一的文件系统服务入口。

#### Scenario: 服务单例
- **WHEN** 导入 FileSystemService
- **THEN** 提供单一实例用于全局访问

#### Scenario: Provider 注册
- **WHEN** 调用 registerProvider(provider)
- **THEN** 将 Provider 添加到注册表，按 scheme 索引

#### Scenario: Provider 路由
- **WHEN** 调用方法传入路径
- **THEN** 根据路径 scheme 自动路由到对应 Provider

### Requirement: 路径解析

系统 SHALL 解析路径并提取 scheme 和实际路径。

#### Scenario: 解析标准路径
- **WHEN** 解析 'memory://docs/test.md'
- **THEN** 返回 { scheme: 'memory', path: 'docs/test.md' }

#### Scenario: 解析 file:// 路径
- **WHEN** 解析 'file:///Users/project/docs/test.md'
- **THEN** 返回 { scheme: 'file', path: '/Users/project/docs/test.md' }

#### Scenario: 解析无效路径
- **WHEN** 解析 'invalid-path-without-scheme'
- **THEN** 抛出 InvalidPath 错误

### Requirement: 能力检查

系统 SHALL 在执行操作前检查 Provider 能力。

#### Scenario: 读取文件能力检查
- **WHEN** 调用 readFile(path)
- **THEN** 检查目标 Provider 是否具备 Read 能力，不足则抛出 PermissionDenied

#### Scenario: 写入文件能力检查
- **WHEN** 调用 writeFile(path, content)
- **THEN** 检查目标 Provider 是否具备 Write 能力，不足则抛出 PermissionDenied

### Requirement: 公共 API 方法

系统 SHALL 提供完整的文件操作 API。

#### Scenario: openDirectory
- **WHEN** 调用 openDirectory(path)
- **THEN** 打开指定目录并缓存句柄

#### Scenario: listFiles
- **WHEN** 调用 listFiles(path)
- **THEN** 返回目录下所有文件的 FileStat 数组

#### Scenario: readFile
- **WHEN** 调用 readFile(path)
- **THEN** 返回文件内容 (string | Uint8Array)

#### Scenario: writeFile
- **WHEN** 调用 writeFile(path, content)
- **THEN** 将内容写入文件

#### Scenario: createDirectory
- **WHEN** 调用 createDirectory(path)
- **THEN** 创建指定目录

#### Scenario: deleteFile
- **WHEN** 调用 deleteFile(path)
- **THEN** 删除指定文件

#### Scenario: deleteDirectory
- **WHEN** 调用 deleteDirectory(path)
- **THEN** 删除指定目录

#### Scenario: stat
- **WHEN** 调用 stat(path)
- **THEN** 返回文件的 FileStat 信息

### Requirement: Disposable 集成

系统 SHALL 集成 Disposable 模式进行资源管理。

#### Scenario: 服务继承 Disposable
- **WHEN** FileSystemService 初始化
- **THEN** 继承 Disposable 基类

#### Scenario: 资源释放
- **WHEN** 调用 dispose()
- **THEN** 释放所有注册的 Provider 和相关资源

#### Scenario: Provider 清理
- **WHEN** 关闭项目时
- **THEN** 清理该项目相关的所有缓存句柄

### Requirement: 错误处理

系统 SHALL 统一处理并转换错误。

#### Scenario: ProviderNotFound
- **WHEN** 使用未注册的 scheme
- **THEN** 抛出 ProviderNotFound 错误

#### Scenario: 错误包装
- **WHEN** Provider 内部抛出错误
- **THEN** 包装为 FileSystemError 并包含原始 cause
