# Typography Paragraph Guidelines Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在设计稿 Typography Section 的 Body Text 列中新增中文 `Paragraph Guidelines` 子区块，补充段落规范、使用场景和真实示例。

**Architecture:** 只修改 `docs/design-system/design-system.pen` 的现有 Typography Section，不新增 token、不改工程代码。通过 Pencil MCP 在 `bodyCol` (`GsYRu`) 末尾插入一个深色细边框说明块，并用布局尺寸扩大容器以避免裁切。

**Tech Stack:** Pencil MCP (`batch_get`, `batch_design`, `snapshot_layout`, `get_screenshot`)；设计稿文件 `docs/design-system/design-system.pen`。

---

## File Structure

- Modify: `docs/design-system/design-system.pen`
  - 现有 Typography Section：`KAyz4`
  - 现有 Body Text 列：`GsYRu`
  - 新增 `Paragraph Guidelines` frame，作为 `GsYRu` 的最后一个子节点。
- Reference: `docs/superpowers/specs/2026-06-14-typography-paragraph-guidelines-design.md`
  - 已确认的设计规格，不需要修改。

---

### Task 1: Add Paragraph Guidelines to Body Text

**Files:**
- Modify: `docs/design-system/design-system.pen`

- [ ] **Step 1: Re-read the target structure**

Use Pencil MCP `batch_get` to confirm the current IDs still exist before editing:

```json
{
  "filePath": "/Users/gaojinlong/ThisMac/project/my-km/docs/design-system/design-system.pen",
  "nodeIds": ["KAyz4", "GsYRu"],
  "readDepth": 3,
  "resolveVariables": true
}
```

Expected: `KAyz4` is `Typography Section`; `GsYRu` is `bodyCol` with existing Body Text entries.

- [ ] **Step 2: Insert the Paragraph Guidelines block**

Use Pencil MCP `batch_design` with this exact input:

```javascript
card=Insert("GsYRu",{type:"frame",name:"Paragraph Guidelines",layout:"vertical",width:"fill_container",gap:12,padding:16,fill:"#1b1b1b",stroke:"#333333",strokeWidth:1,cornerRadius:6,placeholder:true})
Insert(card,{type:"text",name:"paragraphGuidelinesTitle",content:"Paragraph Guidelines",fontFamily:"Inter",fontSize:12,fontWeight:"600",fill:"#888888"})
const items=[
  ["正文段落","14px / 行高 1.6 / Regular。用于长说明、文章正文和设置页解释文案。示例：知识库中的段落应保持稳定的阅读节奏，让用户可以连续阅读多行内容，而不会被过密的文字或过强的样式打断。"],
  ["辅助说明","12px / 行高 1.5 / Regular。用于表单提示、字段说明和状态解释。示例：修改后会自动保存，你也可以在历史记录中恢复之前的版本。"],
  ["强调段落","14px / 行高 1.6 / Medium。用于关键提示、确认信息和重要说明。示例：删除空间会同时移除其中的文档、链接和成员配置，请在操作前确认已完成备份。"],
  ["段落间距","段落内部依赖 line-height 保持阅读节奏；段落组之间使用 12–16px 间距；不要用加粗正文替代标题层级。"]
]
for (const [title,body] of items) {
  group=Insert(card,{type:"frame",name:title,layout:"vertical",width:"fill_container",gap:4})
  Insert(group,{type:"text",name:title+"Title",content:title,fontFamily:"Inter",fontSize:13,fontWeight:"600",fill:"#e0e0e0"})
  Insert(group,{type:"text",name:title+"Body",content:body,fontFamily:"Inter",fontSize:12,fontWeight:"normal",lineHeight:1.55,textGrowth:"fixed-width",width:"fill_container",fill:"#cccccc"})
}
Update(card,{placeholder:false})
Update("KAyz4",{height:620})
```

Expected: `bodyCol` gains one new visible child named `Paragraph Guidelines`; the Typography Section is tall enough to show the full block.

- [ ] **Step 3: Check layout for clipping or overlap**

Use Pencil MCP `snapshot_layout`:

```json
{
  "filePath": "/Users/gaojinlong/ThisMac/project/my-km/docs/design-system/design-system.pen",
  "parentId": "KAyz4",
  "maxDepth": 4,
  "problemsOnly": true
}
```

Expected: no clipped text, no collapsed frames, no overlap problems.

- [ ] **Step 4: Capture visual verification**

Use Pencil MCP `get_screenshot`:

```json
{
  "filePath": "/Users/gaojinlong/ThisMac/project/my-km/docs/design-system/design-system.pen",
  "nodeId": "KAyz4"
}
```

Expected: Typography Section shows Headings, Body Text, Monospace, and the new `Paragraph Guidelines` block under Body Text. All Chinese content is readable.

- [ ] **Step 5: Fix any Pencil warnings**

If `batch_design` or layout verification reports warnings, update existing nodes directly. Use this adjustment if the guideline block is clipped vertically:

```javascript
Update("KAyz4",{height:700})
```

If the Body Text column feels too narrow for Chinese paragraph examples, update only `GsYRu`:

```javascript
Update("GsYRu",{width:520})
```

Then rerun Step 3 and Step 4.

- [ ] **Step 6: Verify git diff without committing**

Run:

```bash
git status --short
```

Expected: `docs/design-system/design-system.pen` is modified. Do not commit unless the user explicitly asks for a commit.

---

## Self-Review

- Spec coverage: Task 1 implements the new `Paragraph Guidelines` block, includes all four required content categories, keeps the existing Typography Section structure, and does not touch code or tokens.
- Placeholder scan: The plan contains no TBD/TODO placeholders; all Pencil snippets and verification commands are explicit.
- Type consistency: Pencil properties match the loaded `.pen` schema: `frame`, `text`, `layout`, `gap`, `padding`, `fill`, `stroke`, `strokeWidth`, `cornerRadius`, `fontFamily`, `fontSize`, `fontWeight`, `lineHeight`, `textGrowth`, `width`, and `height` are supported.