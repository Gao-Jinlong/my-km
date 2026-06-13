# Typography Paragraph Guidelines Design

## 背景

当前 `docs/design-system/design-system.pen` 的 Typography Section 中，Body Text 列只展示了 Body、Body Bold、Caption、Small 的基础样式示例。段落相关内容偏浅，缺少真实中文排版样例和使用规范说明。

## 目标

在 Typography Section 的 Body Text 列中新增 `Paragraph Guidelines` 子区块，用中文补充段落规范、使用场景和真实文案示例，让设计稿既能展示视觉效果，也能指导后续实现。

## 范围

仅更新 `docs/design-system/design-system.pen` 中 Typography Section 的 Body Text 区域：

- 保留现有三栏结构：Headings、Body Text、Monospace。
- 在 Body Text 列下方新增一个深色细边框说明块。
- 不新增 token，不改工程代码。
- 不调整 Headings 和 Monospace 的内容语义。

## 内容结构

`Paragraph Guidelines` 包含四类信息：

1. 正文段落
   - 规格：14px / line-height 1.6 / Regular / muted foreground。
   - 用途：长说明、文章正文、设置页解释文案。
   - 示例：2-3 行中文长文本，展示真实阅读节奏。

2. 辅助说明
   - 规格：12px / line-height 1.5 / Regular / muted foreground。
   - 用途：表单提示、字段说明、状态解释。
   - 示例：短句式说明，保持克制，不抢主内容层级。

3. 强调段落
   - 规格：14px / line-height 1.6 / Medium。
   - 用途：关键提示、确认信息、重要说明。
   - 示例：表达重要信息，但不替代标题层级。

4. 段落间距规则
   - 段落内部依赖 line-height 保持阅读节奏。
   - 段落组之间使用 12–16px 间距。
   - 不用加粗正文替代标题层级。

## 视觉要求

- 子区块放在 Body Text 列下方，作为该列内容的一部分。
- 使用当前设计稿的深色背景、细边框和 muted 文本风格。
- 文案必须完整可见，不出现裁切。
- 保持与 Typography Section 现有 16px 垂直间距节奏一致。
- 如内容高度增加，扩大 Typography Section 或相关容器，保持三栏对齐。

## 验收标准

- 设计稿中可以看到 `Paragraph Guidelines` 子区块。
- 子区块包含正文段落、辅助说明、强调段落、段落间距规则四项。
- 每项都有中文用途说明和真实中文示例或规则说明。
- 所有新增文字可读、未裁切、对比度足够。
- 不影响 Headings 和 Monospace 的既有展示。