## ADDED Requirements

### Requirement: 路径解析函数

系统 SHALL 提供 parsePath 函数用于解析 URI 路径。

#### Scenario: 解析 memory:// 路径
- **WHEN** 调用 parsePath('memory://docs/test.md')
- **THEN** 返回 { scheme: 'memory', authority: '', path: 'docs/test.md' }

#### Scenario: 解析 idb:// 路径
- **WHEN** 调用 parsePath('idb://project-123/files/test.md')
- **THEN** 返回 { scheme: 'idb', authority: 'project-123', path: '/files/test.md' }

#### Scenario: 解析 file:// 路径
- **WHEN** 调用 parsePath('file:///Users/project/docs/test.md')
- **THEN** 返回 { scheme: 'file', authority: '', path: '/Users/project/docs/test.md' }

#### Scenario: 解析无效路径
- **WHEN** 调用 parsePath('invalid-without-scheme')
- **THEN** 抛出 InvalidPath 错误

### Requirement: 路径连接函数

系统 SHALL 提供 join 函数用于连接路径段。

#### Scenario: 连接路径
- **WHEN** 调用 join('/docs', 'test.md')
- **THEN** 返回 '/docs/test.md'

#### Scenario: 连接多段路径
- **WHEN** 调用 join('/projects', 'my-project', 'src', 'index.ts')
- **THEN** 返回 '/projects/my-project/src/index.ts'

#### Scenario: 处理空路径
- **WHEN** 调用 join('', 'test.md')
- **THEN** 返回 'test.md'

### Requirement: 路径目录名函数

系统 SHALL 提供 dirname 函数用于获取目录名。

#### Scenario: 获取文件目录名
- **WHEN** 调用 dirname('/docs/test.md')
- **THEN** 返回 '/docs'

#### Scenario: 根路径
- **WHEN** 调用 dirname('/')
- **THEN** 返回 '/'

#### Scenario: 带协议的路径
- **WHEN** 调用 dirname('memory://docs/subdir/test.md')
- **THEN** 返回 'memory://docs/subdir'

### Requirement: 路径文件名函数

系统 SHALL 提供 basename 函数用于获取文件名。

#### Scenario: 获取文件名
- **WHEN** 调用 basename('/docs/test.md')
- **THEN** 返回 'test.md'

#### Scenario: 目录路径
- **WHEN** 调用 basename('/docs/')
- **THEN** 返回 'docs'

### Requirement: 路径扩展名函数

系统 SHALL 提供 extname 函数用于获取文件扩展名。

#### Scenario: 获取扩展名
- **WHEN** 调用 extname('/docs/test.md')
- **THEN** 返回 '.md'

#### Scenario: 无扩展名
- **WHEN** 调用 extname('/docs/README')
- **THEN** 返回 ''

#### Scenario: 多点文件名
- **WHEN** 调用 extname('/docs/test.min.js')
- **THEN** 返回 '.js'

### Requirement: 路径规范化函数

系统 SHALL 提供 normalize 函数用于规范化路径。

#### Scenario: 移除重复斜杠
- **WHEN** 调用 normalize('/docs//subdir///test.md')
- **THEN** 返回 '/docs/subdir/test.md'

#### Scenario: 解析相对路径
- **WHEN** 调用 normalize('/docs/../src/index.ts')
- **THEN** 返回 '/src/index.ts'

#### Scenario: 处理当前目录
- **WHEN** 调用 normalize('/docs/./test.md')
- **THEN** 返回 '/docs/test.md'
