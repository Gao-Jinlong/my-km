## ADDED Requirements

### Requirement: URI 对象不可变性

URI 对象创建后，其所有组件属性应保持不变，任何修改操作应返回新实例。

#### Scenario: 只读属性
- **WHEN** 创建 URI 实例后尝试直接修改 `uri.scheme = 'http'`
- **THEN** 在 TypeScript 编译时报错（readonly 属性）

#### Scenario: 原始实例保持不变
- **WHEN** 调用 `uri.with({ query: 'new=value' })` 创建新 URI
- **THEN** 原始 `uri` 的 query 属性保持不变

### Requirement: with 方法创建新实例

系统应提供 `with` 方法，通过部分更新创建新的 URI 实例。

#### Scenario: 更新单个组件
- **WHEN** 调用 `uri.with({ query: 'version=2' })`
- **THEN** 返回新 URI 实例，仅 query 改变，其他组件与原 URI 相同

#### Scenario: 更新多个组件
- **WHEN** 调用 `uri.with({ query: 'v=2', fragment: 'new' })`
- **THEN** 返回新 URI 实例，query 和 fragment 改变，其他组件不变

#### Scenario: 空更新返回相同实例
- **WHEN** 调用 `uri.with({})`
- **THEN** 返回与原 URI 相等的新实例（或同一实例，由实现决定）

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
