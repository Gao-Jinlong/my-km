## ADDED Requirements

### Requirement: URI 字符串解析为结构化对象

系统应将 `scheme://path` 格式的 URI 字符串解析为包含 scheme、authority、path、query、fragment 的结构化对象。

#### Scenario: 解析标准 file:// URI
- **WHEN** 调用 `URI.parse('file:///Users/project/docs/readme.md')`
- **THEN** 返回 URI 对象，scheme 为 'file'，path 为 '/Users/project/docs/readme.md'

#### Scenario: 解析带查询参数的 URI
- **WHEN** 调用 `URI.parse('file:///docs/readme.md?v=1#intro')`
- **THEN** 返回 URI 对象，query 为 'v=1'，fragment 为 'intro'

#### Scenario: 解析 idb:// URI
- **WHEN** 调用 `URI.parse('idb://project-123/files/test.md')`
- **THEN** 返回 URI 对象，scheme 为 'idb'，authority 为 'project-123'，path 为 '/files/test.md'

#### Scenario: 解析无效 URI 抛出错误
- **WHEN** 调用 `URI.parse('invalid-uri-without-scheme')`
- **THEN** 抛出错误，提示无效的 URI 格式

### Requirement: 从组件构建 URI

系统应支持从 UriJson 组件构建 URI 对象。

#### Scenario: 从完整组件构建
- **WHEN** 调用 `URI.from({ scheme: 'file', path: '/docs/readme.md', query: 'v=2' })`
- **THEN** 返回 URI 对象，包含所有提供的组件

#### Scenario: 从最小组件构建
- **WHEN** 调用 `URI.from({ scheme: 'file', path: '/docs/readme.md' })`
- **THEN** 返回 URI 对象，authority、query、fragment 为空字符串

### Requirement: 创建文件系统 URI

系统应提供便捷方法从文件系统路径创建 file:// URI。

#### Scenario: 创建绝对路径 URI
- **WHEN** 调用 `URI.file('/Users/project/docs/readme.md')`
- **THEN** 返回 URI 对象，scheme 为 'file'，path 为 '/Users/project/docs/readme.md'

### Requirement: URI 类型守卫

系统应提供类型守卫方法用于判断未知对象是否为 URI 实例。

#### Scenario: 判断 URI 实例
- **WHEN** 调用 `URI.isUri(uriInstance)` 且参数为 URI 实例
- **THEN** 返回 true

#### Scenario: 判断非 URI 对象
- **WHEN** 调用 `URI.isUri({})` 且参数不是 URI 实例
- **THEN** 返回 false
