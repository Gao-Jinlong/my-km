# 设计系统 Design-first 重建方案

- 日期：2026-06-13
- 状态：设计已批准
- 范围：设计系统治理、单一设计稿、token 架构、包骨架

## 问题

当前设计系统方向错误地把代码当作生成设计稿的来源。这会让设计稿变成下游产物，并鼓励代码定义视觉真理。本次重建要反转这个关系：设计系统必须通过设计稿主动维护，代码必须主动对齐设计稿。

当前 `pencil-new.pen` 也可能已经过时、不完整，并且不够体系化。因此本次重建不能只修改代码或围绕它的文档，还必须完善设计稿本身。

## 目标

- 建立一个人工维护的单一设计稿，作为视觉与组件规格来源。
- 移除从代码生成 `.pen` 文件的工作流和文档表述。
- 围绕 design-first、code-aligning 的实践重写设计系统治理语言。
- 将设计稿完善为结构化、可导航的系统，覆盖 foundations、themes、primitives、patterns、domain surfaces、states、migration notes。
- 重塑 `packages/design-tokens` 和早期的 `packages/design-system` 骨架，使它们实现设计稿，而不是定义设计稿。
- 本阶段避免全量迁移业务 UI。

## 非目标

- 任何脚本都不能读取、生成或修改 `.pen` 设计稿。
- 不自动解析 Pencil 文件。
- 不全量迁移 `apps/web` 的所有业务 UI。
- Storybook、Markdown、token 源码或生成产物都不能成为视觉真理源。

## 源头关系

设计系统采用 design-first 模型：

1. `docs/design-system/design-system.pen` 是唯一权威设计稿。
2. `docs/design-system/spec.md` 是文字治理规范和工程边界文档。
3. `packages/design-tokens/src/` 是设计稿中 foundation/theme 决策的工程实现。
4. `packages/design-tokens/dist/*` 仍然只是代码消费用的生成产物。
5. `packages/design-system/` 实现设计稿中定义的 primitives 和 patterns。
6. Storybook 是实现预览和文档展示面，不是设计来源。

如果实现与设计冲突，默认实现是错的。如果设计稿缺少所需的视觉或组件规格，先更新设计稿，再对齐代码。

## 文件变更

- 将 `docs/design-system/pencil-new.pen` 重命名或迁移为 `docs/design-system/design-system.pen`。
- 将 `docs/design-system/design-system-spec.pen` 中有价值的人工维护内容合并进 `design-system.pen`，然后移除这份独立设计稿，避免权威来源分叉。
- 移除或废弃 `scripts/generate-design-system-pen.mjs`。
- 更新 `docs/design-system/agent-guide.md`、`docs/design-system/spec.md`、`AGENTS.md`，以及任何提到生成设计稿的 package scripts。

## 设计稿结构

`design-system.pen` 应是单一文件，内部使用一个顶层 auto-layout 容器。跨层级内容纵向排列，同层级内容横向组织。

顶层分区：

1. `00 Overview`
   - 设计系统定位。
   - design-first 源头关系。
   - 设计原则。
2. `01 Foundations`
   - Colors。
   - Typography。
   - Spacing。
   - Radius。
   - Shadow。
   - Motion。
   - z-index。
3. `02 Themes`
   - Light theme。
   - Dark theme。
   - 未来 sepia / high-contrast 规则。
4. `03 Primitives`
   - Button。
   - Input。
   - Textarea。
   - Select。
   - Checkbox。
   - Dialog。
   - Badge。
   - Card。
   - Tabs。
5. `04 Patterns`
   - PageHeader。
   - EmptyState。
   - ConfirmDialog。
   - Toolbar。
   - SearchCommand。
   - EditorToolbar。
   - FloatingFormatMenu。
6. `05 Domain Surfaces`
   - Workspace shell。
   - Editor surface。
   - AI panel。
   - Trace / observability pages。
7. `06 States`
   - Loading。
   - Empty。
   - Error。
   - Disabled。
   - Focus。
   - Selected。
   - Drag/drop。
8. `07 Migration Notes`
   - 旧 UI 替换说明。
   - 旧 token 替换说明。
   - 延后处理的业务 UI 迁移。

布局规则：

- 顶层分区使用纵向布局。
- 同层级项目使用横向布局或 row 容器。
- 模块内部按语义嵌套：例如 `01 Foundations` 纵向包含 `Colors`、`Typography`、`Spacing`；`Colors` 横向组织 `Light`、`Dark`、`Accent`、`Feedback`。
- 不使用绝对定位表达结构。
- 主要 frame 必须使用 `vertical` 或 `horizontal` layout。
- 使用稳定、可搜索、带数字前缀的命名，例如 `01 Foundations / Colors / Light Theme`。
- 新增同级项进入横向组；新增层级进入纵向序列。
- 如果 frame 重叠或难以导航，先修复布局，而不是继续增加手动定位的 frame。

## Token 架构

`packages/design-tokens/src/` 实现 `design-system.pen` 中定义的 foundations 和 themes。

保留三层概念，但改为由设计稿驱动：

- Reference：设计稿中展示的基础色板、字体族、数值尺度、原始圆角、原始阴影、动效值。
- Semantic：设计稿中的语义角色，例如 `color.bg.primary`、`color.fg.muted`、`color.border.default`、`color.accent.default` 和 feedback 角色。
- Component/domain：当设计稿定义了对应需求时，表达组件变体和领域界面，例如 `button.primary.bg`、`editor.surface.bg`、`workspace.sidebar.bg`。

Token schema 必须从当前仅覆盖 color/editor/workspace 的形态扩展为覆盖：

- `color`
- `typography`
- `spacing`
- `radius`
- `shadow`
- `motion`
- `zIndex`
- `editor`
- `workspace`

Light 和 dark 主题必须保持同形。生成的 `dist` 文件仍然只是代码产物。

## Design-system 包骨架

`packages/design-system` 仍处于早期且骨架很薄，因此允许重写。目标结构：

```text
packages/design-system/src/
  primitives/
    button/
    input/
    textarea/
    select/
    checkbox/
    dialog/
    badge/
    card/
    tabs/
  patterns/
    page-header/
    empty-state/
    confirm-dialog/
    toolbar/
    search-command/
    editor/
      editor-toolbar/
      floating-format-menu/
  styles/
  index.ts
```

规则：

- Primitives 不含业务语义，实现 `design-system.pen` 中的基础组件规格。
- Patterns 是可复用组合，不绑定具体业务实体。
- Editor patterns 放在 `patterns/editor/` 下。
- Domain surfaces 先从设计稿开始定义，不应自动变成共享包组件。
- `index.ts` 只导出公共 API。
- Tailwind preset 和 style helpers 消费 tokens；它们不定义视觉真理。

## 治理规则

- 设计变更从 `design-system.pen` 开始。
- 影响视觉或组件 API 的代码变更，必须检查设计稿是否表达了对应规格。
- 新 token、primitive、pattern 在实现前需要有对应的设计稿分区。
- ADR 记录边界和决策历史，但不替代设计稿。
- Markdown 文档解释流程和工程约束，但不成为视觉规格。
- 文档中不能再出现“代码是唯一真理源”、“Pencil 由代码生成”或“重新生成视觉规格”这类表述。

## 错误处理

- 代码/设计不一致：更新代码，除非先明确修改设计稿。
- 设计规格缺失：先更新 `design-system.pen`，再实现。
- 现有业务 UI 没有匹配规格：记录在 migration notes 中；本阶段不强制全量迁移。
- Frame 重叠或布局散乱：先修复 auto-layout 和 frame 结构。
- 文档/设计冲突：修正文档，使其匹配 `design-system.pen`。

## 验证

实现阶段应运行相关可用命令：

- `pnpm tokens:test`
- `pnpm tokens:verify`
- 如果 package test script 存在，运行 `pnpm --filter @my-km/design-system test`
- 运行被改动包中可用的相关 lint/typecheck 命令

人工验收：

- 只保留一个权威设计系统 `.pen` 文件。
- 没有脚本读取、生成或修改 `.pen` 文件。
- 文档描述 design-first / code-aligning 治理。
- `design-system.pen` 使用纵向层级和横向同级组织。
- Token schema 覆盖设计稿所需的 foundations 和 domains。
- `packages/design-system` 具备清晰的 primitive / pattern / editor-pattern 边界。
