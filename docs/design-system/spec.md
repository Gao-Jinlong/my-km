# my-km Design System Spec

- **Status**: accepted
- **Date**: 2026-06-13
- **Owners**: 单人 + AI agent 协作（小团队 / 设计稿 + 代码双向同步）
- **Source of truth**: 本文件 + `packages/design-tokens/src/`
- **Related**:
  - 设计稿探索：`docs/design-system/pencil-new.pen`
  - 决策记录：`docs/design-system/decisions/`
  - 实施计划（待生成）：`docs/superpowers/specs/2026-06-13-design-system-plan.md`

---

## 0. 背景与目标

### 0.1 现状

| 维度 | 现状 | 问题 |
|---|---|---|
| Token | `apps/web/src/app/globals.css` 内置 `--color-*` + `--ws-*`；`tailwind.config.ts` 各映射一份；Pencil `pencil-new.pen` 手画色板/字号/间距 | 三处不同步，无 single source of truth；`--ws-*` 命名扁平、语义不明 |
| 组件 | `apps/web/src/components/ui/` 共 13 个 shadcn 风格组件 | 数量不够；API 不统一；混入业务组件（LanguageSwitcher）；缺 a11y / Storybook |
| Pattern | 业务里 EmptyState / 确认弹窗 / 页头到处复制粘贴 | 无沉淀，每次重写 |
| 编辑器 UI | Lexical 编辑器内 toolbar / floating menu 散落，颜色间距硬编码 | 不能独立预览、与 chrome 主题耦合 |
| 文档 | 无 Storybook、无文档站、无 ADR | AI agent 与新人无法快速理解可复用资源 |
| 治理 | 无 lint 拦硬编码颜色、无 PR checklist、无设计变更流程 | 每次迭代都在引入熵 |

### 0.2 目标

1. **token 与代码对齐**：代码为唯一源，Pencil 单向同步。
2. **组件库统一化**：Primitives + Patterns 双层结构，覆盖 chrome 与编辑器。
3. **多主题可扩展**：架构上即支持 light / dark + 预留 sepia / high-contrast / 编辑器独立主题。
4. **AI agent 友好**：所有 token / primitive / pattern 在 codegraph 与 `docs/design-system/index.md` 中可被检索。
5. **治理自动化**：lint 守裸颜色、stories 必备、a11y 基线、ADR 记录重大变更。

### 0.3 适用范围

- 覆盖：所有 `apps/web` 用户可见的 UI（chrome + 编辑器）。
- 不覆盖：服务端模板邮件、CLI 工具、未来移动端（届时另立项）。

---

## 1. 整体定位与分层

### 1.1 三大设计哲学

1. **代码为唯一源**：`packages/design-tokens` 的 TS 源文件是真理；CSS、Pencil variables、TS 类型、Markdown 索引都通过脚本生成。禁止人工双向同步。
2. **三层金字塔，禁止跨层乱引**：

   ```
   Patterns          ←  业务可识别的复合模式（EmptyState / EditorToolbar）
      ↑ 用 primitives
   Primitives        ←  无业务语义的基础件（Button / Input / Dialog）
      ↑ 用 tokens
   Tokens            ←  颜色 / 字号 / 间距 / 圆角 / 动效 / editor.* 子树
   ```

   - Primitives **不准**引 Patterns。
   - Tokens **不准**引任何运行时依赖（含 React / DOM）。
   - 由 dependency-cruiser lint 守门。

3. **领域专项 token 与基础 token 分文件、不分层级**：编辑器有自己的 block 间距、inline code 背景、quote 左边线、selection 高亮等需求 → 以 `editor.*` 命名空间作为 Token 层下的"领域子树"，不是新一层。未来加 chart / calendar 同样方式。

### 1.2 包形态（方案 B：双包分层）

```
packages/
  design-tokens/          # 零运行时依赖，纯 TS 常量 + 生成产物
  design-system/          # primitives + patterns + Storybook 故事 + Tailwind preset
apps/
  storybook/              # 独立的设计系统文档站
  web/                    # 业务，依赖 design-system

docs/design-system/
  spec.md                 # 本文件
  pencil-new.pen          # Pencil 探索/评审稿（人工）
  pencil-system.pen       # 由脚本同步、与 token 一致的快照（机器）
  decisions/              # ADR 序列
  index.md                # 由脚本生成的 agent 索引
```

### 1.3 边界判定

| 场景 | 归属 |
|---|---|
| Button / Input / Dialog（无业务语义、可被多领域用） | `packages/design-system/primitives` |
| EmptyState / PageHeader / ConfirmDialog（通用复合模式） | `packages/design-system/patterns` |
| EditorToolbar / FloatingFormatMenu（编辑器领域复合） | `packages/design-system/patterns/editor` |
| ProjectCard / WelcomeHero / AuthForm（绑定具体业务实体） | `apps/web/src/components/{auth,project,...}` |
| Lexical 节点定义、命令、监听 | `apps/web/src/features/editor/`（业务胶水层） |

**判断标准**：能被 ≥ 2 个领域复用 → 进 design-system；否则留 web。

### 1.4 与现有 ui 的关系

`apps/web/src/components/ui/*` 13 个组件**逐步迁出**至 `packages/design-system/primitives`，迁移期允许双存（旧位置 re-export + `@deprecated`），新组件只能进 design-system。

---

## 2. Token 体系

### 2.1 三段式语义结构

```
Tier 1: Reference (原始值)        →  blue.500 = #0969da
                                     gray.50  = #f6f8fa
Tier 2: System (语义角色)          →  color.bg.primary
                                     color.fg.muted
                                     color.accent.default
Tier 3: Component/Domain (上下文)  →  button.primary.bg
                                     editor.code.inline.bg
                                     editor.selection.bg
                                     workspace.sidebar.bg
```

**铁律**：业务代码**只能用 Tier 2 / Tier 3**，绝不能用 Tier 1。

- Tier 1 只供 Tier 2 引；
- Tier 2 是默认层（覆盖 80% 场景）；
- Tier 3 仅在组件/领域有特殊需求时下沉。

主题切换**只动 Tier 2/3 的映射**，Tier 1 保持稳定。

### 2.2 Token 类目清单

| 类目 | Tier 2 关键键名 | 备注 |
|---|---|---|
| `color.bg.*` | primary / secondary / tertiary / hover / active / disabled / overlay | 表面层级 |
| `color.fg.*` | primary / secondary / muted / disabled / on-accent / on-error | 文本/图标 |
| `color.border.*` | default / subtle / strong / focus | |
| `color.accent.*` | default / hover / active / subtle-bg / subtle-fg | 品牌主色 |
| `color.feedback.*` | success / warning / error / info（每个含 default/bg/fg） | 状态色 |
| `typography.family.*` | sans / mono | |
| `typography.size.*` | xs / sm / base / md / lg / xl / 2xl / 3xl | |
| `typography.weight.*` | regular / medium / semibold / bold | |
| `typography.lineHeight.*` | tight / normal / relaxed | |
| `typography.letterSpacing.*` | tight / normal / wide | |
| `typography.preset.*` | display / heading.{1..4} / body.default / body.strong / caption / code | "印刷预设"，UI 优先用 |
| `spacing.*` | 0 / 0.5 / 1 / 1.5 / 2 / 3 / 4 / 5 / 6 / 8 / 10 / 12 / 16（×4px 基线） | 与 Tailwind v4 默认对齐 |
| `radius.*` | none / sm / md / lg / xl / full | |
| `shadow.*` | sm / md / lg / overlay / focus-ring | |
| `motion.duration.*` | fast / base / slow | |
| `motion.easing.*` | standard / emphasized / exit | |
| `zIndex.*` | base / dropdown / sticky / modal / popover / tooltip / toast | 命名常量，杜绝 z-9999 |
| `breakpoint.*` | sm / md / lg / xl / 2xl | |
| `editor.*` | 见 §2.3 | 领域子树 |
| `workspace.*` | sidebar.bg / sidebar.fg / topbar.bg / ... | 升级自现有 `--ws-*` |

### 2.3 编辑器领域子树

```
editor.surface.bg            → 默认借 color.bg.primary
editor.text.body             → 默认借 color.fg.primary
editor.text.muted            → 默认借 color.fg.muted
editor.selection.bg          → 独有：accent 的 alpha 衰减版
editor.cursor                → 独有
editor.code.inline.bg        → 独有
editor.code.inline.fg        → 独有
editor.code.block.bg         → 独有
editor.quote.border          → 独有：左侧 4px 边线色
editor.link.fg / hover       → 默认借 color.accent.default
editor.heading.{1..4}.preset → 引用 typography.preset，编辑器可单独覆盖（行高/字距）
editor.spacing.block         → 独有：block 间距
editor.spacing.indent        → 独有：缩进步长
```

**默认借 base、可独立覆盖**：编辑器主题（sepia / 夜读 / 默认）只改 `editor.*` 那一小撮，不污染 chrome；80% 的 token 自动跟随主品牌色。

### 2.4 命名规范

| 规则 | 示例 | 反例 |
|---|---|---|
| 用 `.` 分层 | `color.bg.primary` | `colorBgPrimary` |
| 状态后缀 | `.hover` / `.active` / `.disabled` / `.focus` | `.hovered` / `.is-hover` |
| 强弱后缀 | `.subtle` / `.default` / `.strong` | `.light` / `.dark`（与主题名冲突） |
| 反色专用 | `fg.on-accent` | `fg.white` |
| 数值刻度 | `xs / sm / md / lg / xl / 2xl` | `1 / 2 / 3 / 4` |

CSS 变量输出形式：`color.bg.primary` → `--color-bg-primary`（生成时统一转换，源码内只用点号形式）。

### 2.5 多主题实现

源码（`packages/design-tokens/src/`）：

```ts
// reference.ts —— 不变的调色盘
export const ref = {
  blue: { 50: '#ddf4ff', 500: '#0969da', 600: '#0860c7' /* ... */ },
  gray: { 0: '#fff', 50: '#f6f8fa', /* ... */, 900: '#1f2328' },
};

// themes/light.ts —— 一份完整的语义映射
export const light = {
  color: {
    bg:     { primary: ref.gray[0], secondary: ref.gray[50], /* ... */ },
    fg:     { primary: ref.gray[900], muted: ref.gray[600], /* ... */ },
    accent: { default: ref.blue[500], /* ... */ },
  },
  editor: {
    selection: { bg: alpha(ref.blue[500], 0.18) },
    quote:     { border: ref.gray[200] },
  },
};

// themes/dark.ts —— 同样形状的另一份（zod schema 校验形状一致）

// themes/index.ts
export const themes = { light, dark } as const;
export type ThemeName = keyof typeof themes;
```

**生成产物**（脚本输出，禁止手写）：

```
packages/design-tokens/dist/
  tokens.css            # :root, [data-theme="light"] { --color-bg-primary: ... }
                        # [data-theme="dark"]          { --color-bg-primary: ... }
  tokens.ts             # { color: { bg: { primary: 'var(--color-bg-primary)' } } }
  tokens.json           # 中间产物，给 Pencil 同步用
  tokens.d.ts           # 完整类型定义
```

业务使用方式（**只允许这一种**）：

```tsx
// ✅ 推荐
<div className="bg-bg-primary text-fg-muted" />

// ✅ 也可以（CSS-in-JS 场景）
import { tokens } from '@my-km/design-tokens';
<div style={{ background: tokens.color.bg.primary }} />

// ❌ 禁止
<div className="bg-[#fff]" />
<div style={{ color: '#1f2328' }} />
```

### 2.6 主题切换机制

- 在 `<html>` 上加 `data-theme="light"` / `data-theme="dark"`（**不用 `class="dark"`**）。
- `tokens.css` 输出形如：

  ```css
  :root, [data-theme="light"] { --color-bg-primary: #fff; /* ... */ }
  [data-theme="dark"]          { --color-bg-primary: #181818; /* ... */ }
  ```

- **编辑器独立主题**（如 sepia 阅读模式）：在编辑器容器节点上挂 `data-editor-theme="sepia"`，CSS 仅覆盖 `editor.*` 那部分变量。靠 CSS 变量级联作用域实现，**不靠 prop drilling**。

### 2.7 Pencil 设计稿协作（单向）

- **Pencil → 代码（探索阶段）**：在 `pencil-new.pen` 画新设计、加新色块；评审通过后**人工**把新值加到 design-tokens 源码，再跑生成。Pencil 在这里是"提案稿"。
- **代码 → Pencil（同步阶段）**：脚本 `pnpm tokens:sync` 读 `tokens.json`，调用 `pencil_set_variables` 注入 `pencil-system.pen` 的 variables，并按模板重新渲染色板/字号/间距示例 frame。
- **铁律**：Pencil 同步是**单向**（代码 → Pencil），不读 Pencil 反向回写。

---

## 3. Primitives 组件库

### 3.1 范围与判定标准

进 primitives 的标准（同时满足）：

1. 没有任何业务术语（不能出现 project / workspace / editor / auth）；
2. 至少能想到 ≥ 2 个不同领域使用；
3. 行为/语义稳定，可由 ARIA role 描述。

不进 primitives：编辑器 Toolbar / FloatingMenu（→ patterns/editor）；ProjectCard / AuthForm（→ apps/web）。

### 3.2 Primitives 完整清单

| 家族 | Primitive | Radix 基底 | 现状 |
|---|---|---|---|
| 表单输入 | Button, IconButton, Input, Textarea, Select, Checkbox, Radio, Switch, Slider, Field, Label, FormControl | radix + 自写 | Button/Input/Checkbox/Textarea/Field/Label 已有，迁移 |
| 覆盖层 | Dialog, AlertDialog, Drawer, Popover, Tooltip, DropdownMenu, ContextMenu, HoverCard | radix | DropdownMenu 已有，其他新增 |
| 导航与容器 | Tabs, Accordion, Collapsible, ScrollArea, Separator, Card, Toolbar | radix | Card/Separator 已有 |
| 反馈 | Alert, Toast, Banner, Progress, Spinner, Skeleton | sonner + radix | Alert 已有 |
| 数据展示 | Avatar, Badge, Tag, Kbd, Code, Table（基础）, List | radix + 自写 | 全新 |
| 导航辅助 | Breadcrumb, Pagination, CommandPalette（基底，cmdk） | cmdk + 自写 | 全新 |

**总计 ~37 个 primitives**。**核心 20 个先做**（覆盖现有 web 业务），剩余按需补。

### 3.3 API 设计公约

1. **`asChild` 模式优先**：所有可被替换为其他元素的 primitive 都支持 `asChild`。

   ```tsx
   <Button asChild><Link href="/x">Go</Link></Button>
   ```

2. **变体走 CVA（class-variance-authority）**：每个组件文件旁配 `*.variants.ts`：

   ```ts
   export const buttonVariants = cva('...', {
     variants: {
       variant: { solid, soft, outline, ghost, link },
       tone:    { neutral, accent, danger, success },
       size:    { xs, sm, md, lg },
     },
   });
   ```

   组件 props 用 `VariantProps<typeof buttonVariants>` 自动推导。

3. **`forwardRef + 全 HTML props 透传`**：所有 primitive `forwardRef` 并 `extends ComponentPropsWithoutRef<...>`，禁止吃掉 `aria-*` / `data-*` / `onKeyDown`。

4. **受控/非受控双模式**：所有有状态的 primitive 同时支持 `defaultValue` 和 `value + onValueChange`（遵循 Radix）。

5. **状态全用 `data-*` 暴露给 CSS**：`data-state="open"` / `data-disabled` / `data-loading`。CSS 通过这些做样式分支，**不要给状态加 `is-active` 类名**。

### 3.4 文件结构

```
packages/design-system/src/primitives/button/
  button.tsx              # 主组件 + forwardRef
  button.variants.ts      # CVA 变体
  button.stories.tsx      # Storybook
  button.test.tsx         # 单测（基础渲染 + a11y）
  index.ts                # barrel
```

**强约束**：每个 primitive 必须有 `*.stories.tsx` 和 `*.test.tsx`，CI 拦缺失。

### 3.5 可访问性基线（不可商量）

每个 primitive 必须满足：

- 键盘可达（Tab / Enter / Esc / 方向键 按交互家族标准）；
- 正确 ARIA role / aria-* 属性（用 Radix 即天然达成）；
- focus 可见（统一 `focus-visible:ring-2 ring-color.border.focus`）；
- 颜色对比 ≥ WCAG AA（4.5:1 文本，3:1 图标）；
- `prefers-reduced-motion` 下关动效。

Storybook 装 `@storybook/addon-a11y`，每个 story 必跑过。

### 3.6 与编辑器 primitives 的关系

| 看似 primitive | 实际定位 |
|---|---|
| 编辑器 Toolbar | **Pattern**：基于 primitive `<Toolbar>` + 一组 `<IconButton>` 组合而成 |
| FloatingMenu | **Pattern**：基于 primitive `<Popover>` |
| Block 选择器 | **Pattern**：基于 `<DropdownMenu>` |
| Inline code 样式 | **不是组件**，是 token + 编辑器 CSS class（`editor.code.inline.bg`） |

判定原则：能被非编辑器复用的下沉为 primitive，专供编辑器的进 `patterns/editor/`。

### 3.7 迁移路径（Stage by Stage）

现状 13 个旧组件。

- **Stage 0（准备）**：建 design-system 包脚手架，跑通 build。
- **Stage 1（迁 5 个最稳的）**：Button / Input / Card / Separator / Label。重写 API 对齐 §3.3 公约。
- **Stage 2（迁有状态的）**：Checkbox / DropdownMenu / Textarea / Alert / Field / Form。
- **Stage 3（特殊件）**：LoadingButton 合并进 Button 的 `loading` prop；LanguageSwitcher 留 web（业务组件）。
- **Stage 4（清理）**：删 `apps/web/src/components/ui`，全部走 `@my-km/design-system`。

迁移期约定：每迁完一个，旧位置 re-export + `@deprecated`，给两周窗口；超期删除。

### 3.8 与 Tailwind v4 / shadcn / Radix 的关系

- **Tailwind v4 留下作为 utility 层**：design-system 内部组件**自己也用 tailwind class** 写样式（不上 CSS-in-JS），消费方继续用 utility 拼业务。
- **shadcn 不当依赖**：现 ui 组件迁过去后**完全自有**，不再 `npx shadcn add`。可参考 shadcn 做法，但代码归我们。
- **Radix 是基底**：作为 npm 依赖固定版本。

---

## 4. Patterns 与编辑器领域

### 4.1 Pattern 定义与判定

**定义**：由多个 primitive 组合 + 一段固定的交互/视觉约定，解决一个**反复出现的 UI 问题**。

判定标准（同时满足）：

1. 在 my-km 里出现 ≥ 3 次（或可预见 ≥ 3 个用例）；
2. 有"标准答案"——抽出来后所有调用方该长得一样；
3. 不依赖具体业务数据形状（接受泛型 / render props / slot）。

反例：`<ProjectCard>` 不是 pattern（绑死 Project）；`<EntityCard>` 是 pattern（接受 `title / description / icon / actions` slot）。

### 4.2 通用 patterns 清单

| Pattern | 解决什么问题 | 组成 primitives |
|---|---|---|
| `PageHeader` | 标题 + 描述 + 右侧动作槽 | Heading + Text + Slot |
| `EmptyState` | 空数据：图标 + 标题 + 描述 + CTA | Icon + Heading + Text + Button |
| `LoadingState` / `ErrorState` | 加载/错误占位 | Spinner / Alert + Button |
| `ConfirmDialog` | 确认弹窗 | AlertDialog 的固化用法 |
| `FormSection` | 表单分组：标题 + 描述 + 一组 Field | Heading + Text + Field |
| `Toolbar` | 通用工具栏（编辑器之外） | Toolbar + IconButton 群 |
| `SidebarNav` | 侧栏导航条目 + 折叠 + 选中态 | List + Collapsible |
| `TabbedPanel` | 顶部 Tabs + 内容区 | Tabs + ScrollArea |
| `SplitView` | 左右两栏可拖拽分隔 | Separator + 拖拽逻辑 |
| `CommandMenu` | 全局命令面板（Cmd+K） | Dialog + cmdk |
| `Toast` 用法约定 | 各种 toast 调用规范 | Toast primitive 包了一层 hook |
| `Field.X` 组合 | 标签 + 输入 + 帮助 + 错误 的标准排版 | Label + Input + Text + Alert |

**~12 个**，**首批做 6 个**：PageHeader / EmptyState / ConfirmDialog / FormSection / Field 组合 / Toast 约定。

### 4.3 编辑器领域 patterns 清单

| Pattern | 说明 |
|---|---|
| `EditorToolbar` | 编辑器顶部/上下文工具栏 |
| `FloatingFormatMenu` | 选区出现的浮动格式化菜单 |
| `BlockTypeSelector` | "段落 / H1 / H2 / Quote / Code / List" 选择下拉 |
| `SlashCommandMenu` | `/` 触发的 block 插入菜单 |
| `LinkEditor` | 链接编辑浮层 |
| `CodeBlockChrome` | 代码块的语言切换 + 复制按钮 chrome（不含 highlight 本体） |
| `EditorEmptyState` | 空文档时的 placeholder 区 |

**只依赖编辑器 token + base primitive**，不直接依赖 Lexical API。Lexical 的接入逻辑（命令、节点、监听）在 `apps/web/src/features/editor/`，pattern 通过 props/render-props 接收 lexical 状态和 callback。**这让编辑器 UI 在没跑 Lexical 的情况下也能在 Storybook 独立预览和测试。**

### 4.4 Pattern API 三原则

1. **Slot 优于 props**：能用 `children` / `actions` / `icon` slot 解决的，不要列十几个 prop。`PageHeader` 的右侧动作就是 `<PageHeader.Actions>`。
2. **状态驱动而非命令式**：pattern 接受状态（`loading` / `error` / `empty` / `selectedId`），不接受指令式 ref 方法。
3. **泛型化数据形状**：列表型 pattern 接受 `items: T[] + renderItem` 或 compound component，**不限定 T 的字段名**。

### 4.5 与 editor token 的协作（CSS 变量级联）

第 2 章定义 `editor.*` token 默认借 base、可独立覆盖。落到 pattern：

- `EditorToolbar` 内部所有颜色/间距引用 `editor.*` token，不引用 `color.bg.primary` —— 这样切 sepia 时工具栏跟编辑器主题，不跟 chrome 主题。
- `IconButton`（primitive）用 base token —— 但被 EditorToolbar 包起来时，**通过 CSS 变量级联自动变色**：`<EditorToolbar>` 容器声明 `--color-fg-primary: var(--editor-text-body)` 这种局部覆盖。

**这是"领域子树"在运行时落地的机制**：靠 CSS 变量的级联作用域，不靠 prop drilling。

### 4.6 文件结构与命名空间

```
packages/design-system/src/patterns/
  page-header/
  empty-state/
  confirm-dialog/
  ...
  editor/                # 编辑器领域子目录
    editor-toolbar/
    floating-format-menu/
    slash-command-menu/
    ...
  index.ts               # export * from './page-header'; export * as Editor from './editor'
```

消费方式：

```ts
import { PageHeader, EmptyState, Editor } from '@my-km/design-system';
<Editor.Toolbar ... />
```

### 4.7 治理升级路径

- **业务里出现重复 → 提级**：apps/web 同段 JSX 在两个 feature 复制 → 触发 ADR → 提级到 design-system patterns。
- **pattern 用得越来越少 → 降级**：使用计数 < 2 处时，降回 web 私有组件或废弃。
- **pattern 出现 fork → 拆分**：用法分歧明显时拆 `EmptyState.Compact` / `EmptyState.Illustrated` 而不是堆 prop。

不靠人记，靠**ADR + 半年一次审计 PR**（见 §5.6 / §6.4）。

### 4.8 Anti-patterns（明文禁止）

- ❌ Pattern 内部直接 `import` 业务 store（zustand / RTK）；
- ❌ Pattern 引用 `next/router` / `next/link` —— 用 `asChild` + 调用方传 Link；
- ❌ Pattern 拼接业务文案；用 i18n key 或必填 prop；
- ❌ Pattern 引用具体 API 类型（`Project` / `Document`）；用泛型；
- ❌ "巨型 pattern"：一个 pattern 内含 ≥ 5 个 primitive 还带条件分支 → 强制拆。

---

## 5. 工程化

### 5.1 Token 生成管线

**输入**（`packages/design-tokens/src/`）：

```
reference.ts       # Tier 1 调色盘
themes/light.ts    # Tier 2/3 语义映射（light）
themes/dark.ts     # Tier 2/3 语义映射（dark）
schema.ts          # Token 形状的 TS 类型 + zod 运行时 schema
```

**生成器**（`packages/design-tokens/scripts/build.ts`）：

- 读 themes，验证两份主题形状必须完全一致（zod schema 比对，不一致直接 fail）；
- 输出四份产物到 `dist/`：
  1. `tokens.css` —— `:root, [data-theme="light"] { ... }` + `[data-theme="dark"] { ... }`
  2. `tokens.ts` —— `{ color: { bg: { primary: 'var(--color-bg-primary)' } } }`
  3. `tokens.json` —— 中间产物，供 Pencil 同步用
  4. `tokens.d.ts` —— 完整类型定义

**npm scripts**：

```
build       # 跑生成
build:watch # 改源 → 自动跑
verify      # 校验两份主题形状一致 + 引用完整性
```

**与 Tailwind 衔接**：design-system 包导出 `tailwind-preset.ts`，读 `tokens.ts` 自动映射进 Tailwind 的 `theme.colors / spacing / borderRadius`。`apps/web/tailwind.config.ts` 只引这个 preset，不再手写颜色。

### 5.2 Pencil 同步脚本

**位置**：`scripts/sync-pencil-tokens.ts`（仓库根级）

**功能**：

- 读 `dist/tokens.json`；
- 调 `pencil_set_variables` 写入 `docs/design-system/pencil-system.pen`；
- 用 `pencil_batch_design` 按模板重新渲染色板/字号/间距示例 frame。

**触发**：本地 `pnpm tokens:sync`；CI 在 design-tokens 包变更时跑校验，diff 超阈值 fail。

**铁律**：单向（代码 → Pencil），不反向回写。

### 5.3 Storybook 站点

**位置**：`apps/storybook/`

**技术选型**：Storybook 8 + Vite builder + React 19 + 装 `docs / a11y / interactions / themes / viewport / measure`。

**主题切换器**：用 `addon-themes` 的 `data-theme` 模式，切 light/dark + 预留 sepia。

**Story 组织**：

```
Tokens/         Colors / Typography / Spacing / Radius / Shadow / Motion / Z-Index
Primitives/     Button / Input / Dialog / ...
Patterns/       PageHeader / EmptyState / ...
Patterns/Editor/  EditorToolbar / FloatingFormatMenu / ...
Foundations/    Accessibility / Layout grid / Iconography
```

**Token stories 自动生成**：写一个 story factory 直接读 `tokens.json`，token 改了 story 自动跟。

**部署**：`pnpm --filter storybook build` → 静态产物，托管 GitHub Pages 或 Vercel 子域名。CI 跑 build 校验，主分支自动部署。

### 5.4 Lint 三阶段

**Stage 1（首发）**：

| 规则 | 实现方式 | 严重度 |
|---|---|---|
| 禁裸十六进制颜色（除 design-tokens 包内） | Stylelint `color-no-hex` + ESLint regex | error |
| 禁止 `style={{ color: '...' }}` 硬编码 | ESLint custom rule | error |
| 禁止 `bg-[#xxx]` arbitrary 颜色 | Tailwind plugin / regex | error |
| 禁止从 `@radix-ui/*` 直接 import 到 `apps/web` | `no-restricted-imports` | warn → error |
| 禁止 `apps/web/src/components/ui/*` 新增文件（迁移期） | 路径白名单 | error |
| primitives 不得 import patterns / 业务 | dependency-cruiser | error |
| tokens 包不得 import React / DOM | dependency-cruiser | error |

**Stage 2（迁移完成后）**：

- Storybook stories 必备检查（CI grep）；
- a11y CI：`@storybook/test-runner` 跑 axe，fail 阻塞合并。

**Stage 3（半年后视情）**：

- Visual regression（Chromatic / Playwright snapshot）；
- Bundle size budget（size-limit）。

### 5.5 测试策略

| 层级 | 工具 | 跑什么 |
|---|---|---|
| Token 完整性 | vitest | 两份主题形状一致、引用合法、CSS 输出语法正确 |
| Primitive 单测 | vitest + testing-library | 渲染、键交互、a11y role、controlled/uncontrolled |
| Pattern 集成测 | vitest + testing-library | 复合交互（"打开 dialog → 点确认 → callback 触发"） |
| 视觉回归（Stage 3） | Playwright snapshot 或 Chromatic | 关键 stories 截图比对 |

**CI 矩阵**：`pnpm -r test` + `pnpm -r typecheck` + `pnpm --filter storybook build` + `pnpm tokens:verify`。

### 5.6 ADR + PR 模板

**ADR 触发条件**：

- 新增 Tier 2 token；
- 新增 primitive；
- pattern 提级 / 降级 / 拆分；
- API 公约变更。

**ADR 模板**（`docs/design-system/decisions/NNNN-title.md`）：

```
# NNNN - <decision title>
- Status: proposed | accepted | superseded by NNNN
- Date:
- Context: 为什么要做这个决定
- Decision: 我们决定怎么做
- Consequences: 影响、被排除选项、风险
- Migration: 旧代码怎么过渡（如适用）
```

**PR 模板**（`.github/pull_request_template.md` 增设）：

```
## Design System Impact
- [ ] No design-system changes
- [ ] New token added — ADR linked: ___
- [ ] New primitive added — Storybook story included
- [ ] New pattern added — ADR linked: ___
- [ ] Breaking API change — migration notes:
```

### 5.7 版本管理

- 不上 changesets / semver 工具（无外部消费方）；
- 两个包根写 `CHANGELOG.md`，里程碑式手动记录；
- Breaking change（rename token、删 primitive）走 ADR + PR 描述里的迁移指引；
- 未来若拆出去给外部消费再上 changesets。

### 5.8 IDE 体验

- `tokens.ts` 用 `as const` + 完整类型，vscode 写 `tokens.color.bg.` 弹自动补全；
- Tailwind preset 注入的 utility 走类型生成，`bg-bg-primary` 在 IDE 有补全 + hover 显示色值；
- ESLint 报错信息直接给修复建议（"使用 `bg-bg-primary` 替代 `#fff`"）。

### 5.9 AI agent 协作三件套

1. **`docs/design-system/index.md`**：脚本汇总的 agent 入口（不手写）。列出所有 token / primitive / pattern 的位置 + 何时用何时不用。
2. **AGENTS.md 增补 `## Design System` 一节**：链接 index.md，列出三条最常违反的规则。
3. **codegraph 索引覆盖 design-system**，agent 用 `codegraph_explore` 直接搜到 primitive 实现。

---

## 6. 落地路线图

### 6.1 Stage 切分

```
Stage 0  脚手架与共识      —— 最小代价，规则与目录确立
Stage 1  Token + 首批 Primitives  —— 真正动到 web 代码
Stage 2  Patterns + 编辑器领域    —— 让"复用"开始发生
Stage 3  治理上轨道         —— Storybook 站 / lint 升 error / a11y CI
Stage 4  收尾与清理         —— 删 web 旧 components/ui
```

每个 stage 满足两个条件才推：**能独立交付价值** + **不阻塞业务迭代**。可在任意 stage 边界暂停。

### 6.2 Stage 0 · 脚手架与共识

**动作**：

1. 新建 `packages/design-tokens/`（pkg.json + tsconfig + 空 src + build 脚本壳子）；
2. 新建 `packages/design-system/`（同上，依赖 design-tokens）；
3. 新建 `apps/storybook/`（Storybook 8 + Vite，启动空白站能跑通）；
4. 写 spec.md（即本文件）；
5. 写首批 ADR：
   - `0001-token-tiering.md`（三段式 + 编辑器子树）
   - `0002-package-layout.md`（双包 + storybook）
   - `0003-api-conventions.md`（CVA + asChild + data-state）
   - `0004-primitive-vs-pattern.md`（判定标准）
6. AGENTS.md 增补一节链接到上述文档。

**验收**：`pnpm install && pnpm -r build` 通过；storybook 空站能起；ADR 在主分支。

**风险**：几乎零。

### 6.3 Stage 1 · Token + 首批 Primitives

**动作**：

1. 写 `reference.ts` + `themes/light.ts` + `themes/dark.ts` + schema；包含 base + `editor.*` 子树；
2. 生成器 `build.ts` 跑通，输出四份产物；
3. design-system 导出 `tailwind-preset.ts`，`apps/web/tailwind.config.ts` 引用；
4. **globals.css 重构**：删除自有 `--color-*` 定义，改 `@import "@my-km/design-tokens/dist/tokens.css"`；保留 `data-theme` 切换；
5. **首批 5 个 primitives 迁移**：Button / Input / Card / Separator / Label，重写 API 对齐 §3.3 公约，旧位置 re-export + `@deprecated`；
6. **批量修硬编码颜色**：跑全仓 grep，把 `#xxx` / `bg-[#xxx]` / `style={{ color }}` 替换为 token utility；**单 PR 不含其他变更**；
7. **`--ws-*` 升级为 `workspace.*` Tier 3 token**：编辑器/三栏布局受影响，单独再开一个 PR；
8. 补 5 个 primitive 的 stories + token 展示 stories；
9. Pencil 同步脚本 `pnpm tokens:sync` 跑通，更新 `pencil-system.pen`。

**验收**：

- `apps/web` 在 Storybook 与生产视觉一致，无回归；
- 全仓搜不到裸 hex 颜色（除 design-tokens 内部）；
- `data-theme="dark"` 切换工作正常；
- 5 个 primitive 在 Storybook 有 stories 可看。

**风险**：

- "硬编码颜色批量修"触达大量文件 → 单 PR 隔离；
- `--ws-*` 重命名涉及编辑器 / 三栏布局 → 单独 PR；
- Tailwind v4 `@theme inline` 与生成 tokens.css 顺序敏感 → 验证 cascade。

### 6.4 Stage 2 · Patterns + 编辑器领域

**动作**：

1. 完成剩余 ~15 个 primitives：Dialog / DropdownMenu / Tooltip / Popover / Tabs / Toast / Spinner / Alert / Badge / IconButton / Field 等；
2. **首批通用 patterns 6 个**：PageHeader / EmptyState / ConfirmDialog / FormSection / Field 组合 / Toast 约定；
3. 业务里把重复 JSX 替换为 patterns；
4. **编辑器 patterns 7 个**：EditorToolbar / FloatingFormatMenu / BlockTypeSelector / SlashCommandMenu / LinkEditor / CodeBlockChrome / EditorEmptyState；
5. 编辑器 token 解耦：把 Lexical 那边写死的颜色/间距换成 `editor.*` token；
6. **CSS 变量级联机制落地**：EditorToolbar 容器声明局部覆盖 `--color-fg-primary`，验证编辑器 token 能独立换主题。

**验收**：

- 业务 feature 目录里 EmptyState / 页头不再有重复定义；
- 编辑器 chrome 全走 design-system patterns + editor token；
- Storybook 中能脱离 Lexical 单独预览所有编辑器 patterns（用 mock 数据）；
- 编辑器容器手动加 `data-editor-theme="sepia"` 改变编辑器外观但不影响 chrome。

**风险**：

- 编辑器 patterns 与 Lexical 解耦时胶水层会变厚 → "显示状态"和"业务状态"严格分离；
- 编辑器原有 CSS 含 magic number → 逐 block 比对截图。

### 6.5 Stage 3 · 治理上轨道

**动作**：

1. **Lint Stage 1 规则全部启用**（之前 warn 升 error）：
   - 禁裸 hex / 禁 arbitrary 颜色 / 禁直接 import @radix-ui；
   - dependency-cruiser 跑分层依赖检查；
   - primitives/patterns 必须有对应 stories.tsx；
2. **a11y CI**：`@storybook/test-runner` 跑 axe，纳入 PR 必过项；
3. PR 模板加 "Design System Impact" checklist；
4. ADR 流程正式启用；
5. **AI agent 协作三件套落地**：
   - 生成 `docs/design-system/index.md`（脚本汇总，自动跑）；
   - codegraph 索引覆盖 design-system；
   - AGENTS.md 增补"如何加新东西"。

**验收**：

- 任何人（含 AI agent）尝试提交裸颜色都被 CI 拦下；
- 新加 primitive 没写 stories 被 CI 拦下；
- index.md 是脚本自动生成的，token / primitive / pattern 改了它会更新。

**风险**：lint 升 error 后会冒出 legacy 违规 → 提前留窗口批量修。

### 6.6 Stage 4 · 收尾清理

**动作**：

1. 删除 `apps/web/src/components/ui/` 全部内容；
2. 删除 `globals.css` 里所有冗余的旧变量定义；
3. 部署 Storybook 到 `design.my-km.dev`（或 GitHub Pages 子路径）；
4. 写 `packages/design-system/README.md`（给未来人/agent 看）；
5. 半年后做第一次 design-system 审计 PR：跑 pattern 使用计数、清理未使用 token、归档过期 ADR。

**验收**：

- `apps/web/src/components/ui` 不存在；
- 全仓无 `from '../ui/...'`；
- Storybook 站点公开可访问。

### 6.7 时间预估（参考，不强约束）

| Stage | 工作量级 | 业务侵入度 |
|---|---|---|
| 0 脚手架 | 半天–1 天 | 零 |
| 1 Token + 5 primitives | 3–5 天（含批量修硬编码） | 中（拆 PR 控制） |
| 2 Patterns + 编辑器 | 5–8 天 | 中高（编辑器迁移是大头） |
| 3 治理 | 2–3 天 | 低（CI 与文档） |
| 4 清理 | 1 天 + 半年后审计 | 零 |

### 6.8 失败回滚预案

- Stage 1 出问题：design-system 从 web 退出，恢复 globals.css 原本颜色定义（一次 revert）；
- Stage 2 编辑器 patterns 出 bug：编辑器目录单独 revert，token 与 primitives 不受影响；
- Stage 3 lint 误伤太多：对应规则降回 warn；
- Stage 4 删旧 ui 后发现遗漏：从 git 历史拉回单个文件即可。

---

## 附录 A · 决策摘要表

| # | 决策 | 选定 | 备选 | 文档 |
|---|---|---|---|---|
| 1 | 现状痛点排序 | 整体规划 | 单点突破 | §0 |
| 2 | 使用与协作场景 | 小团队 + 设计代码双向 | 单人 / 多人发包 | §0 |
| 3 | 覆盖边界 | 含编辑器 + 专项 token | 仅 chrome / 仅 base | §1.3 / §2.3 |
| 4 | Token 唯一源 | 代码（design-tokens） | 中立源生成 / 文档 | §2 / §5.1 |
| 5 | 包形态 | 双包（tokens + system） | 单包 / 三包 | §1.2 |
| 6 | 文档平台 | Storybook + Pencil 双质 | 仅 Storybook / 内部 styleguide | §5.3 / §2.7 |
| 7 | 主题支持 | 多主题可扩展（data-theme） | 仅 light / 仅 light+dark | §2.5 / §2.6 |
| 8 | 治理偏重 | 文档 + 轻 lint，分阶段加重 | 全自动化硬架构 / 仅文档 | §5.4 |
| 9 | Token 分层 | Reference / System / Domain 三段 | 扁平 / 两段 | §2.1 |
| 10 | 编辑器层级 | Tokens 子树（默认借 base） | 独立一层 | §2.3 / §4.5 |
| 11 | 组件 API | CVA + asChild + data-state + forwardRef + 受控双模 | shadcn 默认 / 自创 | §3.3 |
| 12 | 旧 ui 处理 | 渐进迁出 + re-export 过渡 | 一次性大爆炸 / 不迁 | §3.7 |
| 13 | shadcn 关系 | 不当依赖，自有代码 | 持续 npx shadcn add | §3.8 |
| 14 | Pattern 解耦 | pattern 不依赖 Lexical API | pattern 直连 lexical | §4.3 |
| 15 | 主题作用域 | CSS 变量级联 | prop drilling | §4.5 |
| 16 | 版本管理 | 手动 CHANGELOG，不上 changesets | changesets | §5.7 |
| 17 | AI 三件套 | 启用（index + AGENTS + codegraph） | 不做 | §5.9 |

## 附录 B · 术语表

- **Token / Design Token**：跨平台、可机读的设计变量，本系统分 Tier 1/2/3。
- **Primitive**：无业务语义的基础组件，强调可访问性 + 通用 API。
- **Pattern**：由 primitive 组合的复合 UI 模式，解决反复出现的具体问题。
- **Reference / System / Component**：三段式 token 分层（也称 Global / Alias / Component，本系统用 Tier 1/2/3 表达）。
- **Single Source of Truth (SoT)**：唯一权威源，本系统是 `packages/design-tokens/src/`。
- **CVA**：[class-variance-authority](https://cva.style/)，用类型安全方式定义组件变体。
- **ADR**：Architecture Decision Record，结构化的决策记录。
- **领域子树（Domain subtree）**：在 token 树下以命名空间形式存在的领域专用 token 集合，如 `editor.*` / `workspace.*`。
- **CSS 变量级联作用域**：通过在子节点声明 CSS 变量覆盖父节点同名变量，让组件自动跟随上下文主题变色，无需 prop drilling。

## 附录 C · 参考资料

- [Material Design Tokens](https://m3.material.io/foundations/design-tokens/overview)
- [Adobe Spectrum Design Tokens](https://spectrum.adobe.com/page/design-tokens/)
- [GitHub Primer Primitives](https://primer.style/foundations/primitives)
- [Radix UI](https://www.radix-ui.com/) — 无头 primitives 基底
- [shadcn/ui](https://ui.shadcn.com/) — 风格参考（不作为依赖）
- [class-variance-authority](https://cva.style/) — 变体管理
- [Style Dictionary](https://amzn.github.io/style-dictionary/) — Token 工具链参考（本系统未直接采用，借鉴其分层思想）

---

**End of Spec**
