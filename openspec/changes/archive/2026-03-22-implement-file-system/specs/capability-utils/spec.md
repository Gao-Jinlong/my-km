## ADDED Requirements

### Requirement: 能力检查函数

系统 SHALL 提供 hasCapability 函数用于检查是否具备所需能力。

#### Scenario: 检查单一能力
- **WHEN** 调用 hasCapability(15, 1) 检查 Read 能力
- **THEN** 返回 true (15 包含 1)

#### Scenario: 检查不足能力
- **WHEN** 调用 hasCapability(1, 2) 检查 Write 能力
- **THEN** 返回 false (1 不包含 2)

#### Scenario: 检查组合能力
- **WHEN** 调用 hasCapability(11, 3) 检查 Read+Write
- **THEN** 返回 true (11 = 1011, 3 = 0011)

### Requirement: 能力组合函数

系统 SHALL 提供 combineCapabilities 函数用于组合多个能力。

#### Scenario: 组合两个能力
- **WHEN** 调用 combineCapabilities(1, 2)
- **THEN** 返回 3 (Read | Write)

#### Scenario: 组合多个能力
- **WHEN** 调用 combineCapabilities(1, 2, 4, 8)
- **THEN** 返回 15 (FullAccess)

#### Scenario: 组合零个能力
- **WHEN** 调用 combineCapabilities()
- **THEN** 返回 0 (None)

### Requirement: 预设能力模式

系统 SHALL 定义预设的能力模式常量。

#### Scenario: ReadOnly 模式
- **WHEN** 访问 ReadOnly 模式
- **THEN** 值为 9 (Read | Metadata)

#### Scenario: ReadWrite 模式
- **WHEN** 访问 ReadWrite 模式
- **THEN** 值为 11 (Read | Write | Metadata)

#### Scenario: FullAccess 模式
- **WHEN** 访问 FullAccess 模式
- **THEN** 值为 15 (Read | Write | List | Metadata)
