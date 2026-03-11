## 1. 安装测试依赖

- [x] 1.1 在 `apps/web/package.json` 中添加 Vitest 相关依赖
- [x] 1.2 添加 @testing-library/react 和 @testing-library/jest-dom
- [x] 1.3 添加 jsdom 作为测试环境
- [x] 1.4 添加 @testing-library/user-event 用于用户交互测试
- [x] 1.5 执行 `pnpm install` 安装依赖

## 2. 配置 Vitest

- [x] 2.1 创建 `apps/web/vitest.config.ts` 配置文件
- [x] 2.2 配置路径别名解析 (`@/*` 和 `@workspace/*`)
- [x] 2.3 配置测试环境为 jsdom
- [x] 2.4 配置测试文件匹配模式 (`**/*.test.ts` 和 `**/*.test.tsx`)

## 3. 配置测试全局设置

- [x] 3.1 创建 `apps/web/src/__tests__/setup.ts` 测试初始化文件
- [x] 3.2 注册 @testing-library/jest-dom 匹配器
- [x] 3.3 在 vitest.config.ts 中引用 setup 文件

## 4. 更新 package.json Scripts

- [x] 4.1 添加 `test` 脚本运行 vitest
- [x] 4.2 添加 `test:watch` 脚本进入 watch 模式
- [x] 4.3 添加 `test:coverage` 脚本生成覆盖率报告

## 5. 迁移现有测试文件

- [x] 5.1 更新 `file-handle-cache.test.ts` 导入（`@jest/globals` → `vitest`）
- [x] 5.2 更新 `file-system-service.test.ts` 导入
- [x] 5.3 更新 `file-resource-manager.test.ts` 导入
- [x] 5.4 更新 `disposable-verification.test.ts` 导入
- [x] 5.5 将 `jest.fn()` 等 API 替换为 `vi.fn()`

## 6. 验证测试框架

- [x] 6.1 运行 `pnpm test` 验证所有测试通过
- [x] 6.2 运行 `pnpm test:watch` 验证 watch 模式
- [x] 6.3 运行 `pnpm test:coverage` 验证覆盖率报告生成

**注意**: 部分测试因 mock 配置问题失败，需要修复 IndexedDB 和 FileSystemService 的 mock。
