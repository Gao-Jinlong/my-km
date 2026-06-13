# 设计稿可读性优化方案

- 日期：2026-06-13
- 状态：设计已批准
- 范围：`docs/design-system/design-system.pen` 视觉修复，不涉及代码变更

## 问题

`design-system.pen` 存在三个视觉可读性问题：

1. **文字颜色太暗**：Foundations 分区中大量描述文字使用 `#1f2328`（近黑色），在深色画布（`#0d0d0d` → `#1e1e1e` → `#161616`）上几乎不可见。
2. **theme 颜色太少**：Themes 分区每主题仅展示 2 个色块（bg-primary + accent），远不足以覆盖设计系统的语义色需求。Token schema 定义了约 34 个语义角色/主题。
3. **shadow 预览不可见**：Shadow 预览块 `fill: #222` 放在 `#161616` 背景上，阴影为 `#000000`，三者深度接近无法区分。

## 非目标

- 不修改 token 源码（`packages/design-tokens/src/`）。
- 不修改组件代码（`packages/design-system/src/`）。
- 不改变设计稿的顶层分区结构（00-07 编号不变）。
- 不修改色板/色块内部已有的对比色文字（它们本身是正确的）。

## 修复方案

### 修复 1：文字可读性

**影响范围**：`01 Foundations` 内的 Color Section、Typography Section、Spacing & Radius 区域。

**规则**：色板/色块**内部**的文字保持原对比色（如浅色背景上的深色字），只修改深色画布上的**描述性文字**。

| 元素类型 | 当前 | 修复为 | 用途 |
|----------|------|--------|------|
| Section 标题 | `#1f2328` | `#e0e0e0` | "Color System"、"Typography"、"Spacing Scale"、"Border Radius" |
| 分组标签 | `#1f2328` / `#636c76` | `#cccccc` / `#888888` | "Headings"、"Body Text"、"Monospace"、"Light Theme"、"Dark Theme" |
| 标题样本（h1-h4） | `#1f2328` | `#e0e0e0` | 字号展示 |
| 正文样本（body、bodyBold） | `#1f2328` | `#cccccc` | 正文展示 |
| 代码样本（mono1） | `#1f2328` | `#cccccc` | 等宽展示 |
| 附注文字（sp4t-sp32t、r1t-r3t） | `#636c76` | `#888888` | 间距/圆角标签 |

其他分区（00 Overview、Shadow、Motion、z-index、03-07）已使用可读色，无需改动。

### 修复 2：Color System 扩展

采用分层放置策略：Tier 1 reference 色板放在 Foundations，Tier 2 语义色放在 Themes。

#### 2a. Foundations > Color System 新增 Reference Palette

在现有 Light/Dark 分组之前，新增一个 "Reference Palette" 纵向组，展示 Tier 1 原始色阶。每行为一个色系，横向排列色块。

色阶数据来源：`packages/design-tokens/src/reference.ts` 中的 `ref` 对象。

| 色系 | 色阶 | 值 |
|------|------|----|
| Gray | 13 阶 | `0` #ffffff, `50` #f6f8fa, `100` #ebeef1, `200` #d0d7de, `300` #afb8c1, `400` #8c959f, `500` #6e7781, `600` #636c76, `700` #424a53, `800` #32383f, `900` #1f2328, `950` #171b22, `1000` #000000 |
| Blue | 10 阶 | `50` #ddf4ff, `100` #b6e3ff, `200` #80ccff, `300` #54aeff, `400` #218bff, `500` #0969da, `600` #0860c7, `700` #0550ae, `800` #033d8b, `900` #0a3069 |
| Red | 6 阶 | `50` #ffebe9, `100` #ffcecb, `300` #ff8182, `500` #d1242f, `600` #cf222e, `700` #a40e26 |
| Green | 4 阶 | `50` #dafbe1, `300` #4ac26b, `500` #1a7f37, `700` #116329 |
| Yellow | 4 阶 | `50` #fff8c5, `300` #d4a72c, `500` #9a6700, `700` #7d4e00 |

每个色块：48×40px，圆角 4px，显示色阶名 + hex 值。色块文字根据背景明暗自动选择对比色（浅色背景用 `#1f2328`，深色背景用 `#cccccc`）。

#### 2b. Themes 分区扩展为完整语义色

当前 2 个简单卡片 → 改为 2 个主题面板（Light / Dark），每个面板纵向排列 5 个语义分类组。

| 分类 | 色块数 | 角色 |
|------|--------|------|
| bg | 7 | primary, secondary, tertiary, hover, active, disabled, overlay |
| fg | 6 | primary, secondary, muted, disabled, on-accent, on-error |
| border | 4 | default, subtle, strong, focus |
| accent | 5 | default, hover, active, subtle-bg, subtle-fg |
| feedback | 12 | success/warning/error/info × default/bg/fg |

每主题约 34 个色块。色块尺寸 72×48px，圆角 4px，显示角色名 + hex 值。

**主题面板背景**：Light 面板使用 light theme 的 bg-primary（`#ffffff`），Dark 面板使用 dark theme 的 bg-primary（`#181818`）。这样语义色在其真实主题环境中展示，色块上的文字也自然获得正确对比度。

语义色值来源：`packages/design-tokens/src/themes/light.ts` 和 `dark.ts`。

### 修复 3：Shadow 预览

在 Shadow 分区内嵌一个浅色卡片作为预览舞台。

结构：

```
Shadow 分区 (#161616 深色卡片, 外层标题/描述用可读色)
  └─ 预览舞台 (#f6f8fa 浅色圆角卡片, cornerRadius 8, padding 24)
       ├─ sm:          预览块 (#ffffff 白底, 60×40, 圆角 8) + shadow effect
       ├─ md:          预览块 (#ffffff 白底) + shadow effect
       ├─ lg:          预览块 (#ffffff 白底) + shadow effect
       ├─ overlay:     预览块 (#ffffff 白底) + shadow effect
       └─ focus-ring:  预览块 (#ffffff 白底) + shadow effect
```

- 预览舞台背景 `#f6f8fa`（gray-50），深色阴影在浅色上有足够对比。
- 每个预览块改为 `#ffffff` 白底 + 对应 shadow effect。
- 预览块尺寸 60×40px，圆角 8px（保持不变）。
- 预览行内的名称和值文字使用深色（`#1f2328` / `#636c76`），因为它们在浅色舞台上。
- 外层 Shadow 分区的标题和描述文字保持可读色（`#cccccc` / `#888888`），不变。

## 验证

- 使用 Pencil MCP 截图检查每个修复区域：
  - Foundations > Color System：Reference Palette 色阶完整，Light/Dark 组描述文字可读。
  - Foundations > Typography：所有字号样本在深色画布上清晰可见。
  - Foundations > Spacing & Radius：标签可读。
  - Foundations > Shadow：5 个阴影层级在浅色舞台上可区分。
  - Themes：两个主题面板各展示 5 个语义分类，约 34 色块/主题。
- 确认色板内部文字对比度未被破坏。
- 确认设计稿其他分区（00-07）未受影响。
