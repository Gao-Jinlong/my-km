## 1. 文档结构搭建

- [x] 1.1 创建 change 目录结构 `openspec/changes/vscode-disposable-pattern-spec/`
- [x] 1.2 创建 proposal.md 文档，说明 Dispose 模式的引入原因和变更内容
- [x] 1.3 创建 design.md 文档，描述技术设计和关键决策
- [x] 1.4 创建 specs 目录结构，为每个 capability 建立独立文件夹

## 2. 核心规范文档

- [x] 2.1 编写 `disposable-pattern-core/spec.md` - 定义 IDisposable 接口和核心职责
- [x] 2.2 编写 `disposable-store-usage/spec.md` - DisposableStore 的使用规范
- [x] 2.3 编写 `disposable-base-class/spec.md` - Disposable 基类的继承约定
- [x] 2.4 编写 `dispose-function/spec.md` - dispose 工具函数的行为定义
- [x] 2.5 编写 `lifecycle-best-practices/spec.md` - 最佳实践和常见陷阱

## 3. 代码示例和用例

- [x] 3.1 为每个 spec 添加完整的 TypeScript 代码示例
- [x] 3.2 补充常见使用场景的用例说明
- [x] 3.3 添加反模式示例（什么不应该做）

## 4. 文档验证和审查

- [x] 4.1 验证所有 spec 与现有 `lifecycle.ts` 实现一致
- [x] 4.2 对照 VSCode 原生实现验证设计规范
- [ ] 4.3 团队内部分享和 review 文档
- [ ] 4.4 根据反馈修订文档内容

## 5. 文档归档和发布

- [x] 5.1 完成 openspec change 归档
- [ ] 5.2 将 spec 文档链接添加到项目 README 或 docs 目录
- [ ] 5.3 在代码审查检查项中添加 Dispose 模式规范
