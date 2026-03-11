## Context

**项目背景：**
- Web 应用使用 Next.js 16 + React 19 + TypeScript
- 已有 4 个测试文件位于 `apps/web/src/platform/file/__tests__/`，使用 Jest 语法
- 当前 `apps/web/package.json` 缺少测试框架依赖和 scripts
- Server 端 (`apps/server`) 已使用 Jest + ts-jest 配置

**约束条件：**
- 需要与 Next.js 16 兼容
- 需要支持 TypeScript 和路径别名 (`@/*`)
- 需要支持 React 组件测试
- 尽量复用现有测试文件结构

## Goals / Non-Goals

**Goals:**
- 为 Web 应用配置完整的测试框架
- 支持单元测试（工具函数、hooks、服务）
- 支持 React 组件测试
- 提供测试覆盖率报告
- 支持 watch 模式开发

**Non-Goals:**
- E2E 测试（由 Playwright 负责，不在本范围内）
- 修改现有测试业务逻辑
- 性能基准测试

## Decisions

### 1. 选择 Vitest 而非 Jest

**选择：Vitest**

**理由：**
| 维度 | Vitest | Jest |
|------|--------|------|
| 速度 | 更快（并行执行，启动快） | 较慢 |
| ESM 支持 | 原生支持 | 需要配置 |
| Next.js 生态 | 更友好，配置简单 | 需要 `next/jest` |
| 配置 | 单一配置文件 | 配置复杂 |
| 开发者体验 | 即时 watch 模式 | watch 模式较慢 |
| 兼容性 | 兼容 Jest API | 原生 |

**备选方案考虑：**
- **Jest + next/jest**: 配置复杂，速度慢，但 Jest API 原生支持
- **Vitest**: 最终选择，因为更快速、配置更简单，且兼容 Jest API

### 2. 测试库选择

- **@testing-library/react**: React 组件测试标准库
- **@testing-library/jest-dom**: DOM 匹配器（`toBeInTheDocument` 等）
- **@testing-library/user-event**: 用户交互模拟（比 `fireEvent` 更真实）

### 3. 目录结构

保留现有结构：
```
apps/web/
├── vitest.config.ts       # 新增
├── src/
│   ├── __tests__/         # 全局测试工具（可选）
│   │   └── setup.ts       # 测试初始化
│   └── **/__tests__/*.test.ts   # 现有测试文件位置
```

### 4. 测试文件命名

- 使用 `*.test.ts` / `*.test.tsx` 后缀
- 与现有文件保持一致（4 个现有文件均使用 `.test.ts`）

## Risks / Trade-offs

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| Vitest 与 Next.js 某些特性不兼容 | 部分测试可能失败 | 使用 `vitest-environment-jsdom`，必要时配置 alias |
| 现有 Jest 语法需要迁移 | 需要修改导入语句 | `@jest/globals` → `vitest`，大部分 API 兼容 |
| 团队熟悉度 | 需要学习新工具 | Vitest API 与 Jest 高度兼容，学习成本低 |

## Migration Plan

1. 安装依赖
2. 创建 `vitest.config.ts`
3. 创建 `src/__tests__/setup.ts`
4. 更新 `package.json` scripts
5. 迁移现有测试文件导入
6. 运行测试验证

**回滚策略：**
- 移除新增依赖
- 删除配置文件
- 恢复测试文件导入（如需要）

## Open Questions

无
