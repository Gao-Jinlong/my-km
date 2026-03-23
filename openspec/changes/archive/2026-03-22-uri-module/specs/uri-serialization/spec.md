## ADDED Requirements

### Requirement: URI 序列化为 JSON

系统应将 URI 对象序列化为 UriJson 格式，支持状态持久化和跨系统传递。

#### Scenario: 序列化为完整 JSON
- **WHEN** 调用 `uri.toJSON()` 且 URI 包含所有组件
- **THEN** 返回 `{ scheme, authority, path, query, fragment }` 对象

#### Scenario: 序列化为最简 JSON
- **WHEN** 调用 `uri.toJSON()` 且 URI 仅包含 scheme 和 path
- **THEN** 返回的对象中 authority、query、fragment 为空字符串

### Requirement: JSON 反序列化为 URI

系统应支持从 UriJson 对象还原 URI 实例。

#### Scenario: 从完整 JSON 还原
- **WHEN** 调用 `URI.from({ scheme: 'file', path: '/docs.md', query: 'v=1' })`
- **THEN** 返回与原 URI 相等的新 URI 实例

### Requirement: URI 序列化为字符串

系统应将 URI 对象序列化为 `scheme://path` 格式的字符串。

#### Scenario: 序列化简单 URI
- **WHEN** 调用 `URI.parse('file:///docs/readme.md').toString()`
- **THEN** 返回字符串 `'file:///docs/readme.md'`

#### Scenario: 序列化带查询参数和片段
- **WHEN** 调用 `URI.parse('file:///docs/readme.md?v=1#intro').toString()`
- **THEN** 返回字符串 `'file:///docs/readme.md?v=1#intro'`

#### Scenario: 序列化 idb:// URI
- **WHEN** 调用 `URI.parse('idb://project-123/files/test.md').toString()`
- **THEN** 返回字符串 `'idb://project-123/files/test.md'`
