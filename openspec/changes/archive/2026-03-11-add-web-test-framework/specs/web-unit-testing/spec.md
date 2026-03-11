## ADDED Requirements

### Requirement: 开发者可以运行 Web 应用单元测试

系统应支持开发者运行 Web 应用的单元测试，包括工具函数、自定义 hooks 和 React 组件的测试。

#### Scenario: 运行所有测试
- **WHEN** 开发者执行 `pnpm test` 命令
- **THEN** 系统运行 `apps/web` 下所有 `*.test.ts` 和 `*.test.tsx` 文件，并输出测试结果

#### Scenario: 运行 watch 模式
- **WHEN** 开发者执行 `pnpm test:watch` 命令
- **THEN** 系统进入 watch 模式，文件变化时自动重新运行相关测试

#### Scenario: 生成测试覆盖率报告
- **WHEN** 开发者执行 `pnpm test:coverage` 命令
- **THEN** 系统生成 HTML 和文本格式的覆盖率报告，输出到 `coverage/` 目录

### Requirement: 测试支持 TypeScript 路径别名

测试框架应支持项目中配置的 TypeScript 路径别名，确保测试代码可以使用与源代码相同的导入方式。

#### Scenario: 使用 `@/*` 别名导入
- **WHEN** 测试文件使用 `@/components/button` 导入模块
- **THEN** 测试框架正确解析路径并加载对应模块

#### Scenario: 使用 `@workspace/shared` 别名导入
- **WHEN** 测试文件使用 `@workspace/shared` 导入共享模块
- **THEN** 测试框架正确解析路径并加载对应模块

### Requirement: 测试支持 React 组件渲染

测试框架应支持 React 组件的渲染和交互测试。

#### Scenario: 渲染 React 组件
- **WHEN** 测试使用 `render()` 函数渲染 React 组件
- **THEN** 组件正确渲染到 jsdom 环境中

#### Scenario: 用户交互测试
- **WHEN** 测试模拟用户点击、输入等操作
- **THEN** 组件正确响应交互事件

### Requirement: 测试文件使用 vitest API

所有测试文件应使用 vitest 提供的测试 API，与 Jest API 保持兼容。

#### Scenario: 使用 describe/it/expect 编写测试
- **WHEN** 测试文件从 `vitest` 导入 `describe`, `it`, `expect`
- **THEN** 测试正确执行并断言

#### Scenario: 使用 mock 功能
- **WHEN** 测试使用 `vi.fn()`, `vi.mock()` 创建 mock
- **THEN** mock 函数正确拦截调用并返回预期值
