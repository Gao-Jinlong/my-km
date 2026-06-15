# Design System Agent Guide

> AI agent 快速上手指南 — design-first 治理，按需读取

## Source relationship (design-first)

1. `docs/design-system/design-system.pen` — **唯一权威设计稿**（人工维护）
2. `docs/design-system/spec.md` — 文字治理规范和工程边界
3. `packages/design-tokens/src/` — 设计稿中 foundation/theme 决策的工程实现
4. `packages/design-system/` — 设计稿中 primitives 和 patterns 的工程实现

**如果实现与设计冲突，默认实现是错的。**
**如果设计稿缺少规格，先更新设计稿，再对齐代码。**

## Quick start

```bash
# Visual spec (read-only, never script)
open docs/design-system/design-system.pen

# Token source code
codegraph_explore "design-tokens themes light dark"

# Component source (when populated)
codegraph_explore "primitives button input dialog"
codegraph_explore "patterns empty-state page-header"
```

## Three-tier token architecture

```
Tier 3 → Component/Domain  (editor.*, workspace.*, button.primary.bg)
Tier 2 → System / Semantic  (color.bg.primary, color.fg.muted)
Tier 1 → Reference          (blue.500 = #0969da, gray.50 = #f6f8fa)
```

Token categories: `color` / `typography` / `spacing` / `radius` / `shadow` / `motion` / `zIndex` / `editor` / `workspace`.

## Golden rules

| # | Rule | Enforcement |
|---|------|-------------|
| 1 | **No bare hex colors** — use token utilities only (`bg-bg-primary`, `text-fg-muted`) | ESLint + Stylelint (error) |
| 2 | **No `bg-[#xxx]` / `style={{ color }}`** — go through tokens | Tailwind plugin + ESLint |
| 3 | **New UI components → `packages/design-system/`**, never `apps/web/src/components/ui/` | no-restricted-imports |
| 4 | **Design changes start in `design-system.pen`**, never in code | code review |
| 5 | **No script reads, generates, or modifies `.pen` files** | convention |
| 6 | **Business code only uses Tier 2/3 tokens**, never Tier 1 | code review |

## When to use what

| Need | Use | Location |
|------|-----|----------|
| Button / Input / Dialog / Badge (no business meaning) | **Primitive** | `packages/design-system/src/primitives/` |
| PageHeader / EmptyState / ConfirmDialog (repeated >=3x) | **Pattern** | `packages/design-system/src/patterns/` |
| EditorToolbar / FloatingFormatMenu (editor-specific) | **Editor Pattern** | `packages/design-system/src/patterns/editor/` |
| ProjectCard / AuthForm (binds business entity) | **Business component** | `apps/web/src/components/{domain}/` |
| Color / spacing / typography values | **Token** | `packages/design-tokens/src/` |
| Visual spec for any of the above | **Design file** | `docs/design-system/design-system.pen` |

**Boundary test**: Can >=2 domains use it? -> design-system. Only one domain? -> stays in web.

## Changing the design system

1. **Visual change**: Edit `docs/design-system/design-system.pen` first
2. **Token change**: Edit `packages/design-tokens/src/` to match the design -> run `pnpm tokens:build`
3. **Add primitive/pattern**: Verify `design-system.pen` has a matching spec section -> create component in `packages/design-system/src/`
4. **ADR required** for: new Tier 2 token, new primitive, pattern promotion/demotion, API convention changes

## 编辑 `.pen` 设计稿的布局规范

> 通过 Pencil MCP 修改设计稿时**必须遵守**。违反这些规则会导致坐标偏移、内容被裁切、布局坍塌。

### 核心原则：像组织 HTML 一样组织节点

`.pen` 文件的 frame + flex 布局等价于 HTML 的 `<div>` + CSS flexbox。**用语义化嵌套组织层级，让布局系统自动计算位置——绝不手动写坐标。**

### 必须遵守的规则

| # | 规则 | 原因 |
|---|------|------|
| P1 | **用 frame 嵌套组织内容**，绝不把所有元素扁平散落在同一个容器里 | 扁平结构等于把 HTML 全写成 body 的直接子元素，违背语义层级 |
| P2 | **全程用 flex 布局**（`layout: "vertical"` / `"horizontal"`），禁用 `layout: "none"` 手写坐标 | `layout:"none"` 的绝对定位会出现坐标偏移，难以预测；flex 让布局系统自动计算 |
| P3 | **尺寸用 `fit_content` / `fill_container`**，绝不用固定像素硬编码子元素宽高（除非固定尺寸的图标/徽章） | 固定像素在内容变化时会溢出或留白；自适应尺寸永远正确 |
| P4 | **文本用 `textGrowth: "fixed-width"` + `width: "fill_container"`** 实现自动换行 | 不设 `textGrowth` 的宽高会被忽略，长文本溢出容器 |
| P5 | **`alignItems` 只接受 `start` / `center` / `end`**，不支持 `stretch` | 传 `"stretch"` 会报错并回滚整个操作 |
| P6 | **新增顶层 frame 时设 `placeholder: true`**，完成后再 `Update(..., {placeholder: false})` | 标记进行中的工作，避免留下半成品 |
| P7 | **改完每个 section 立即用 `snapshot_layout(problemsOnly: true)` 验证**，有 clip 就地修复 | 堆到最后再查，问题会交叉感染难以定位 |

### 正确的结构示例

新增一个 pattern card 时，按 HTML 语义嵌套：

```
Pattern Card (frame, vertical, padding, gap)     ← 外层容器，vertical flex
├── Header (frame, horizontal, gap)              ← 横向排列的 header
│   ├── Chip (frame, horizontal): dot + label
│   └── Ownership note (text)
├── Title (text, fill_container, fixed-width)
├── Content Row (frame, horizontal, gap)         ← 子区域横向并排
│   ├── Card A (frame, horizontal, fill_container): icon + info + badge
│   ├── Card B (frame, horizontal, fill_container)
│   └── Card C (frame, horizontal, fill_container)
└── Token Chips (frame, horizontal, gap)
```

每个 frame 的子元素由 flex 自动定位，**不写任何 `x` / `y`**。

### 反面案例（全部会导致布局坍塌）

```js
// ❌ 反模式 1：扁平散落，所有元素都是同一容器的直接子元素
parent = Insert(document, {type:"frame", layout:"none"})
Insert(parent, {type:"text", x:0, y:0, content:"title"})
Insert(parent, {type:"text", x:0, y:30, content:"desc"})
Insert(parent, {type:"frame", x:0, y:60, ...})

// ❌ 反模式 2：layout:"none" + 手写坐标（会出现不可预测的偏移）
card = Insert(parent, {type:"frame", layout:"none", width:300, height:100})
Insert(card, {type:"text", x:14, y:14, ...})  // 实际渲染 y 可能变成 64

// ❌ 反模式 3：固定像素宽高容纳动态内容（溢出或留白）
info = Insert(card, {type:"frame", width:200, height:50, layout:"vertical"})
Insert(info, {type:"text", content:"很长的文本会溢出..."})

// ✅ 正确：flex 嵌套 + 自适应尺寸
info = Insert(card, {type:"frame", width:"fill_container", height:"fit_content", layout:"vertical", gap:4})
Insert(info, {type:"text", textGrowth:"fixed-width", width:"fill_container", content:"自动换行"})
```

### 父容器注意事项

- 新增的顶层 pattern frame 应插入到对应的 section 容器（如 `03 Product Patterns` 的 `Vvj25`）中，不要直接插到 document 根。
- 如果父容器是 `layout:"none"`（历史遗留的扁平布局），**不要继承这种模式**——你的新内容内部仍然用 flex 嵌套。新 frame 作为父容器的子元素时，用 `x`/`y` 定位到空闲区域即可（通过 `FindEmptySpace` 查找），但 frame 内部全部用 flex。
- 完成后扩大父容器 `height` 容纳新内容，避免被 clip。

### 字体注意

Pencil 的 `fontFamily` 不接受带引号的 CSS 字体栈（如 `'SF Mono', monospace`）。mono 字体用 `JetBrains Mono`；sans 字体用 `Inter` 或省略（用 token 变量 `$typography.family.sans` 作为变量引用也不可靠，直接写字体名）。

## Source of truth

| What | Where |
|------|-------|
| Visual spec (authoritative) | `docs/design-system/design-system.pen` |
| Written governance | `docs/design-system/spec.md` |
| Token source (implements design) | `packages/design-tokens/src/` |
| Token output (generated, don't edit) | `packages/design-tokens/dist/tokens.css` |
| ADR records | `docs/design-system/decisions/` |
| Storybook | `pnpm design:storybook` -> localhost:6006 |

## Component API conventions

- **CVA** for variants: `cva('...', { variants: { variant, tone, size } })`
- **asChild** pattern: `<Button asChild><Link href="/x">Go</Link></Button>`
- **data-state** for CSS: `data-state="open"`, `data-disabled`, `data-loading` -- no `.is-active` classes
- **forwardRef** + extends `ComponentPropsWithoutRef<...>`
- **Controlled + Uncontrolled**: `value + onValueChange` AND `defaultValue`

## Naming conventions

| Correct | Wrong |
|---------|-------|
| `color.bg.primary` (dot-separated) | `colorBgPrimary` |
| `.hover` / `.active` / `.disabled` | `.hovered` / `.is-hover` |
| `.subtle` / `.default` / `.strong` | `.light` / `.dark` |
| `fg.on-accent` | `fg.white` |
| `xs / sm / md / lg / xl / 2xl` | `1 / 2 / 3 / 4` |

CSS variable: `color.bg.primary` -> `--color-bg-primary` (auto-generated, never hand-write).
