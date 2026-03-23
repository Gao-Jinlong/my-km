# URI 模块规范

## 概述

URI 模块用于解析和序列化文件系统路径，是系统内部资源定位的基础能力。

**代码目录**: `apps/web/src/base/common/uri/`

**设计目标**:
- 路径解析：将 `scheme://path` 格式解析为结构化对象
- 资源标识：在系统内部传递文件资源
- 可序列化：支持 JSON 序列化和反序列化
- 不可变设计：URI 对象创建后不可修改

---

## 需求

### Requirement: URI 字符串解析

系统应将 `scheme://path` 格式的 URI 字符串解析为包含 scheme、authority、path、query、fragment 的结构化对象。

#### Scenario: 解析标准 file:// URI
- **WHEN** 调用 `URI.parse('file:///Users/project/docs/readme.md')`
- **THEN** 返回 URI 对象，scheme 为 'file'，path 为 '/Users/project/docs/readme.md'

#### Scenario: 解析带查询参数和片段的 URI
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

### Requirement: URI 序列化为 JSON

系统应将 URI 对象序列化为 UriJson 格式，支持状态持久化和跨系统传递。

#### Scenario: 序列化为完整 JSON
- **WHEN** 调用 `uri.toJSON()` 且 URI 包含所有组件
- **THEN** 返回 `{ scheme, authority, path, query, fragment }` 对象

#### Scenario: 序列化为最简 JSON
- **WHEN** 调用 `uri.toJSON()` 且 URI 仅包含 scheme 和 path
- **THEN** 返回的对象中 authority、query、fragment 为空字符串

#### Scenario: 从 JSON 还原 URI
- **WHEN** 调用 `URI.from(json)` 且 json 是有效的 UriJson 对象
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

### Requirement: URI 不可变性

URI 对象创建后，其所有组件属性应保持不变，任何修改操作应返回新实例。

#### Scenario: 原始实例保持不变
- **WHEN** 调用 `uri.with({ query: 'new=value' })` 创建新 URI
- **THEN** 原始 `uri` 的 query 属性保持不变

#### Scenario: 更新单个组件
- **WHEN** 调用 `uri.with({ query: 'version=2' })`
- **THEN** 返回新 URI 实例，仅 query 改变，其他组件与原 URI 相同

#### Scenario: 更新多个组件
- **WHEN** 调用 `uri.with({ query: 'v=2', fragment: 'new' })`
- **THEN** 返回新 URI 实例，query 和 fragment 改变，其他组件不变

### Requirement: URI 相等性比较

系统应提供 `isEqual` 方法用于比较两个 URI 是否相等。

#### Scenario: 相同 URI 相等
- **WHEN** 调用 `uri1.isEqual(uri2)` 且两个 URI 所有组件相同
- **THEN** 返回 true

#### Scenario: 不同 URI 不相等
- **WHEN** 调用 `uri1.isEqual(uri2)` 且两个 URI 有任何组件不同
- **THEN** 返回 false

#### Scenario: 与 null/undefined 比较
- **WHEN** 调用 `uri.isEqual(null)` 或 `uri.isEqual(undefined)`
- **THEN** 返回 false

### Requirement: 文件系统路径访问

系统应提供 `fsPath` 计算属性用于获取文件系统路径。

#### Scenario: 获取 file:// URI 的路径
- **WHEN** 访问 `uri.fsPath` 且 uri 为 `file:///Users/project/docs/readme.md`
- **THEN** 返回 `/Users/project/docs/readme.md`

---

## API 接口

```typescript
interface UriJson {
  scheme: string;
  authority: string;
  path: string;
  query: string;
  fragment: string;
}

class URI {
  // 静态方法
  static parse(value: string): URI;
  static from(components: UriJson): URI;
  static file(path: string): URI;
  static isUri(obj: unknown): obj is URI;

  // 只读属性
  readonly scheme: string;
  readonly authority: string;
  readonly path: string;
  readonly query: string;
  readonly fragment: string;

  // 计算属性
  get fsPath(): string;

  // 实例方法
  toString(): string;
  toJSON(): UriJson;
  with(changes: Partial<UriJson>): URI;
  isEqual(other: URI | null | undefined): boolean;
}
```
