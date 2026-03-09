# file-system-service Specification

## Purpose
TBD - created by archiving change file-system-service. Update Purpose after archive.
## Requirements
### Requirement: 打开项目目录
系统 SHALL 支持用户选择并打开一个项目目录。

#### Scenario: 成功打开项目
- **WHEN** 用户通过文件选择器选择一个文件夹
- **THEN** 系统存储该项目目录句柄并返回项目信息

#### Scenario: 重复打开同一项目
- **WHEN** 用户打开一个已经缓存的项目
- **THEN** 系统直接从缓存获取项目信息而不重新选择

### Requirement: 打开项目内文件
系统 SHALL 支持打开项目目录中的文件。

#### Scenario: 打开已知文件
- **WHEN** 用户请求打开项目内的某个文件
- **THEN** 系统从缓存获取文件句柄并返回文件内容

#### Scenario: 打开新文件
- **WHEN** 用户选择一个尚未缓存的文件
- **THEN** 系统缓存该文件句柄并返回文件内容

### Requirement: 读取文件内容
系统 SHALL 支持读取文件的内容。

#### Scenario: 读取文本文件
- **WHEN** 用户请求读取文本文件
- **THEN** 系统返回文件的文本内容

#### Scenario: 读取二进制文件
- **WHEN** 用户请求读取二进制文件
- **THEN** 系统返回文件的 Blob 或 ArrayBuffer 内容

### Requirement: 写入文件内容
系统 SHALL 支持写入内容到文件。

#### Scenario: 写入文件
- **WHEN** 用户保存对文件的修改
- **THEN** 系统将新内容写入文件

#### Scenario: 创建新文件
- **WHEN** 用户在项目中创建一个新文件
- **THEN** 系统在目录中创建文件并缓存其句柄

### Requirement: 列出目录内容
系统 SHALL 支持列出目录中的文件和子目录。

#### Scenario: 列出根目录
- **WHEN** 用户请求查看项目根目录
- **THEN** 系统返回根目录下所有文件和子目录的列表

#### Scenario: 列出子目录
- **WHEN** 用户请求查看某个子目录
- **THEN** 系统返回该子目录下所有文件和子目录的列表

### Requirement: 获取文件信息
系统 SHALL 支持获取文件的元数据信息。

#### Scenario: 获取文件基本信息
- **WHEN** 用户请求获取文件信息
- **THEN** 系统返回文件名、大小、最后修改时间等信息

### Requirement: 关闭项目
系统 SHALL 支持关闭当前打开的项目并释放相关资源。

#### Scenario: 关闭项目
- **WHEN** 用户关闭项目
- **THEN** 系统释放该项目相关的所有文件句柄和资源

