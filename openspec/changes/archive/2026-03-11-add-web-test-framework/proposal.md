## Why

目前 Web 应用 (`apps/web`) 已有测试文件（使用 Jest 编写），但 `package.json` 中缺少测试框架的依赖配置和 `package.json` scripts。这导致测试无法运行，开发团队无法验证代码正确性和回归问题。

本变更旨在为 Web 项目添加完整的测试框架支持，包括单元测试和组件测试能力。

## What Changes

- 添加 **Vitest** 作为测试运行器（比 Jest 更快速，对 ESM 和 Next.js 生态更友好）
- 添加 **@testing-library/react** 用于 React 组件测试
- 添加 **@testing-library/jest-dom** 提供 DOM 匹配器
- 添加 **jsdom** 作为测试环境
- 配置 `vitest.config.ts` 支持项目路径别名 (`@/*`)
- 添加测试脚本：`test`, `test:watch`, `test:coverage`
- 保留现有测试文件结构 (`**/*.test.ts` 和 `**/*.test.tsx`)

## Capabilities

### New Capabilities

- `web-unit-testing`: 为 Web 应用添加单元测试能力，支持工具函数、hooks 和组件测试
- `web-test-config`: Vitest 配置和测试工具设置

### Modified Capabilities

- 无

## Impact

- **apps/web/package.json**: 添加测试相关依赖和脚本
- **apps/web/vitest.config.ts**: 新增配置文件
- **apps/web/src/platform/file/__tests__/*.test.ts**: 现有测试文件需要更新导入路径（从 `@jest/globals` 改为 `vitest`）
- **测试迁移**: 现有 4 个测试文件需要从 Jest 语法迁移到 Vitest 语法
