## ADDED Requirements

### Requirement: IFileSystemProvider 接口定义

系统 SHALL 定义统一的 IFileSystemProvider 接口，所有 Provider 实现必须遵循。

#### Scenario: 接口基本属性
- **WHEN** 定义 Provider 接口
- **THEN** 包含 name, scheme, rootPath, capabilities 属性

#### Scenario: canHandle 方法
- **WHEN** 调用 canHandle(path)
- **THEN** 返回 boolean 表示该 Provider 是否能处理指定路径

#### Scenario: 文件读取方法
- **WHEN** 调用 readFile(path)
- **THEN** 返回 Promise<FileContent> 包含文件内容

#### Scenario: 文件写入方法
- **WHEN** 调用 writeFile(path, content)
- **THEN** 返回 Promise<void>，将内容写入文件

#### Scenario: 目录列出方法
- **WHEN** 调用 listFiles(path)
- **THEN** 返回 Promise<FileStat[]> 包含目录下所有文件统计信息

#### Scenario: 目录创建方法
- **WHEN** 调用 createDirectory(path)
- **THEN** 返回 Promise<void>，创建指定目录

#### Scenario: 文件删除方法
- **WHEN** 调用 deleteFile(path)
- **THEN** 返回 Promise<void>，删除指定文件

#### Scenario: 目录删除方法
- **WHEN** 调用 deleteDirectory(path)
- **THEN** 返回 Promise<void>，删除指定目录

#### Scenario: 文件统计方法
- **WHEN** 调用 stat(path)
- **THEN** 返回 Promise<FileStat> 包含文件元信息

#### Scenario: 获取文件句柄方法
- **WHEN** 调用 getFileHandle(path, mode)
- **THEN** 返回 Promise<FileSystemFileHandle | FileSystemDirectoryHandle>

### Requirement: 路径协议前缀

系统 SHALL 使用协议前缀格式 `{scheme}://{path}` 标识资源路径。

#### Scenario: memory 协议
- **WHEN** 使用 memory:// 前缀
- **THEN** 路由到 MemoryProvider

#### Scenario: idb 协议
- **WHEN** 使用 idb:// 前缀
- **THEN** 路由到 IndexedDBProvider

#### Scenario: file 协议
- **WHEN** 使用 file:// 前缀
- **THEN** 路由到 FileSystemAccessAPIProvider

### Requirement: 能力检查机制

系统 SHALL 在 Provider 执行操作前进行能力检查。

#### Scenario: 读取前检查 Read 能力
- **WHEN** 调用 readFile 前
- **THEN** 检查 Provider 是否具备 Read 能力

#### Scenario: 写入前检查 Write 能力
- **WHEN** 调用 writeFile 前
- **THEN** 检查 Provider 是否具备 Write 能力

#### Scenario: 列出目录前检查 List 能力
- **WHEN** 调用 listFiles 前
- **THEN** 检查 Provider 是否具备 List 能力

#### Scenario: 能力不足时抛出错误
- **WHEN** 能力检查失败
- **THEN** 抛出 PermissionDenied 错误
