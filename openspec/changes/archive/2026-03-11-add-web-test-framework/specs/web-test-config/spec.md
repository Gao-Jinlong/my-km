## ADDED Requirements

### Requirement: Vitest 配置文件

项目应包含 `vitest.config.ts` 配置文件，用于配置测试框架的各项设置。

#### Scenario: 配置文件存在
- **WHEN** 开发者查看 `apps/web/vitest.config.ts` 文件
- **THEN** 文件包含 vitest 配置、路径别名设置和测试环境配置

#### Scenario: 路径别名解析
- **WHEN** vitest 运行时遇到 `@/` 开头的导入
- **THEN** 根据 tsconfig.json 中的 paths 配置正确解析

### Requirement: 测试全局配置

项目应包含测试全局配置文件，用于设置测试前的初始化工作。

#### Scenario: 自定义匹配器注册
- **WHEN** 测试运行时
- **THEN** `@testing-library/jest-dom` 的匹配器被正确注册

#### Scenario: jsdom 环境配置
- **WHEN** 测试需要 DOM API
- **THEN** jsdom 环境正确初始化并提供浏览器 API

### Requirement: package.json 测试脚本

package.json 应包含测试相关的 npm scripts。

#### Scenario: test 脚本
- **WHEN** 开发者运行 `pnpm test`
- **THEN** 执行 vitest 运行所有测试

#### Scenario: test:watch 脚本
- **WHEN** 开发者运行 `pnpm test:watch`
- **THEN** vitest 进入 watch 模式

#### Scenario: test:coverage 脚本
- **WHEN** 开发者运行 `pnpm test:coverage`
- **THEN** vitest 生成覆盖率报告

### Requirement: 测试相关依赖

package.json 应包含所有必需的测试依赖。

#### Scenario: 开发依赖安装
- **WHEN** 开发者执行 `pnpm install`
- **THEN** vitest、@testing-library/react、jsdom 等依赖被安装
