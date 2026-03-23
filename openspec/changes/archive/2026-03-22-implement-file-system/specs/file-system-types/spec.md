## ADDED Requirements

### Requirement: 文件系统能力枚举

系统 SHALL 定义文件系统能力枚举，用于位运算组合。

#### Scenario: 定义基础能力
- **WHEN** 定义能力枚举
- **THEN** 包含 None (0), Read (1<<0), Write (1<<1), List (1<<2), Metadata (1<<3)

#### Scenario: 组合能力 - ReadOnly
- **WHEN** 组合 ReadOnly 模式
- **THEN** 值为 Read | Metadata = 9

#### Scenario: 组合能力 - ReadWrite
- **WHEN** 组合 ReadWrite 模式
- **THEN** 值为 Read | Write | Metadata = 11

#### Scenario: 组合能力 - FullAccess
- **WHEN** 组合 FullAccess 模式
- **THEN** 值为 Read | Write | List | Metadata = 15

### Requirement: 文件统计信息接口

系统 SHALL 定义 FileStat 接口用于描述文件元信息。

#### Scenario: 文件统计信息结构
- **WHEN** 获取文件统计信息
- **THEN** 返回包含 type, name, size, ctime, mtime 的对象

#### Scenario: 区分文件和目录
- **WHEN** 获取统计信息
- **THEN** type 字段为 'file' 或 'directory'

### Requirement: 文件内容类型

系统 SHALL 定义文件内容类型为 string | Uint8Array。

#### Scenario: 文本文件内容
- **WHEN** 读取文本文件
- **THEN** 返回 string 类型内容

#### Scenario: 二进制文件内容
- **WHEN** 读取二进制文件
- **THEN** 返回 Uint8Array 类型内容

### Requirement: 文件系统错误码

系统 SHALL 定义文件系统错误码枚举。

#### Scenario: 定义错误码
- **WHEN** 定义错误码枚举
- **THEN** 包含 ProviderNotFound, PermissionDenied, FileNotFound, DirectoryNotFound, FileAlreadyExists, InvalidPath, ReadFailed, WriteFailed, UserDeniedPermission

### Requirement: FileSystemError 错误类

系统 SHALL 定义 FileSystemError 类继承自 Error。

#### Scenario: 创建错误实例
- **WHEN** 抛出 FileSystemError
- **THEN** 包含 code 字段和 cause 可选字段

#### Scenario: PermissionDenied 错误
- **WHEN** 能力检查失败
- **THEN** 抛出 PermissionDenied 错误

#### Scenario: FileNotFound 错误
- **WHEN** 访问不存在的文件
- **THEN** 抛出 FileNotFound 错误
