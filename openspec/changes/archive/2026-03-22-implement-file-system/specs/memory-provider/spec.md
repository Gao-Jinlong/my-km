## ADDED Requirements

### Requirement: MemoryProvider 实现

系统 SHALL 实现 MemoryProvider 用于内存存储和测试。

#### Scenario: 存储结构
- **WHEN** MemoryProvider 初始化
- **THEN** 使用 Map<string, FileEntry> 存储数据

#### Scenario: 写入文件
- **WHEN** 调用 writeFile('memory://docs/test.md', 'content')
- **THEN** 将内容存储到内存 Map 中

#### Scenario: 读取文件
- **WHEN** 调用 readFile('memory://docs/test.md')
- **THEN** 从内存 Map 中返回之前存储的内容

#### Scenario: 列出目录
- **WHEN** 调用 listFiles('memory://docs/')
- **THEN** 返回该路径下所有文件和子目录

#### Scenario: 创建目录
- **WHEN** 调用 createDirectory('memory://new-dir/')
- **THEN** 在内存中创建目录条目

#### Scenario: 删除文件
- **WHEN** 调用 deleteFile('memory://docs/test.md')
- **THEN** 从内存 Map 中删除该文件

#### Scenario: 删除目录
- **WHEN** 调用 deleteDirectory('memory://docs/')
- **THEN** 从内存中删除该目录及所有子内容

#### Scenario: 获取文件统计信息
- **WHEN** 调用 stat('memory://docs/test.md')
- **THEN** 返回包含 size, ctime, mtype 的 FileStat 对象

#### Scenario: 文件不存在
- **WHEN** 读取不存在的文件
- **THEN** 抛出 FileNotFound 错误

#### Scenario: 路径无效
- **WHEN** 使用无效路径调用方法
- **THEN** 抛出 InvalidPath 错误

### Requirement: MemoryProvider 能力

系统 SHALL 定义 MemoryProvider 具备所有基础能力。

#### Scenario: 能力定义
- **WHEN** 访问 MemoryProvider.capabilities
- **THEN** 返回 Read | Write | List | Metadata = 15 (FullAccess)

#### Scenario: canHandle 检查
- **WHEN** 调用 canHandle('memory://test.md')
- **THEN** 返回 true

#### Scenario: canHandle 其他协议
- **WHEN** 调用 canHandle('idb://test.md')
- **THEN** 返回 false
