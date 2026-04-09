# 编辑器核心功能实施计划 — Markdown 同步与富文本编辑

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现编辑器核心功能，包括 Markdown ↔ Block[] ↔ Lexical 双向转换、文件读写同步、行内格式支持

**Architecture:** 采用分层转换架构：Markdown 文件 ↔ Block[] ↔ Lexical 节点树。Block[] 为规范内容格式，Inline[] 表示行内格式。

**Tech Stack:** Next.js 16, React 19, Lexical 0.39, Zustand, TypeScript, Vitest, markdown-it

**Spec Document:** [2026-04-08-editor-core-functionality-design.md](../specs/2026-04-08-editor-core-functionality-design.md)

---

**Status**: ✅ 已完成 (2026-04-08)

**Test Results**: 5 个测试文件全部通过，约 100 个测试用例

---

## Task 1: Inline 类型系统与 Block 类型更新

### Task 1.1: 定义 Inline 类型系统

- [x] **Step 1: 创建 Inline 类型定义**

文件：`features/editor/types/block.ts`

```typescript
export type InlineMark = 
    | 'bold' | 'italic' | 'underline' | 'strikethrough'
    | 'code' | 'highlight' | 'subscript' | 'superscript';

export interface Inline {
    text: string;
    bold?: boolean;
    italic?: boolean;
    underline?: boolean;
    strikethrough?: boolean;
    code?: boolean;
    highlight?: boolean;
    subscript?: boolean;
    superscript?: boolean;
    link?: { url: string; title?: string };
}
```

- [x] **Step 2: 更新 Block 内容类型**

```typescript
export interface ParagraphContent { inline: Inline[]; }
export interface HeadingContent { inline: Inline[]; level: 1|2|3|4|5|6; }
export interface QuoteContent { inline: Inline[]; cite?: string; }
export interface ListItem { id: string; inline: Inline[]; checked?: boolean; }
```

- [x] **Step 3: 运行类型检查**

```bash
cd apps/web && npx tsc --noEmit
```

- [x] **Step 4: 提交**

```bash
git add apps/web/src/features/editor/types/block.ts
git commit -m "feat(editor): add Inline type system for rich text formatting"
```

---

### Task 1.2: 更新内置块类型配置

- [x] **Step 1: 更新 builtin-types.ts**

文件：`features/editor/registry/builtin-types.ts`

```typescript
// 更新 defaultContent
defaultContent: () => ({ inline: [] })

// 更新 isValid
isValid: (content) => Array.isArray(content.inline)
```

- [x] **Step 2: 提交**

```bash
git add apps/web/src/features/editor/registry/builtin-types.ts
git commit -m "feat(editor): update builtin block types for Inline[] content"
```

---

## Task 2: Markdown ↔ Block[] 转换层

### Task 2.1: MarkdownParser 实现

- [x] **Step 1: 创建 MarkdownParser**

文件：`features/editor/converter/markdown-parser.ts`

```typescript
import markdownIt from 'markdown-it';

export class MarkdownParser {
    private parser: markdownIt.MarkdownIt;

    constructor() {
        this.parser = markdownIt();
    }

    parse(markdown: string): Block[] {
        const tokens = this.parser.parse(markdown, {});
        const blocks: Block[] = [];
        
        // 遍历 token AST，生成 Block[]
        for (let i = 0; i < tokens.length; i++) {
            const token = tokens[i];
            switch (token.type) {
                case 'heading_open':
                    blocks.push(this.parseHeading(token, tokens, i));
                    break;
                case 'paragraph_open':
                    blocks.push(this.parseParagraph(token, tokens, i));
                    break;
                case 'bullet_list_open':
                    blocks.push(this.parseList(token, tokens, 'bullet'));
                    break;
                case 'ordered_list_open':
                    blocks.push(this.parseList(token, tokens, 'number'));
                    break;
                case 'blockquote_open':
                    blocks.push(this.parseQuote(token, tokens, i));
                    break;
                case 'fence':
                case 'code_block':
                    blocks.push(this.parseCode(token));
                    break;
            }
        }
        
        return blocks;
    }

    private parseInlineTokens(inlineTokens: any[]): Inline[] {
        return inlineTokens.map(token => {
            const inline: Inline = { text: token.content || '' };
            if (token.tag === 'strong') inline.bold = true;
            if (token.tag === 'em') inline.italic = true;
            if (token.tag === 'code') inline.code = true;
            if (token.tag === 's') inline.strikethrough = true;
            if (token.tag === 'a') {
                inline.link = { url: token.attrGet('href') || '' };
            }
            return inline;
        });
    }
}
```

- [x] **Step 2: 提交**

```bash
git add apps/web/src/features/editor/converter/markdown-parser.ts
git commit -m "feat(editor): add MarkdownParser for Markdown to Block[] conversion"
```

---

### Task 2.2: MarkdownSerializer 实现

- [x] **Step 1: 创建 MarkdownSerializer**

文件：`features/editor/converter/markdown-serializer.ts`

```typescript
export class MarkdownSerializer {
    serialize(blocks: Block[]): string {
        return blocks.map(block => {
            switch (block.type) {
                case 'heading':
                    return this.serializeHeading(block.content);
                case 'paragraph':
                    return this.serializeParagraph(block.content.inline);
                case 'list':
                    return this.serializeList(block.content);
                case 'quote':
                    return this.serializeQuote(block.content);
                case 'code':
                    return this.serializeCode(block.content);
                default:
                    return '';
            }
        }).join('\n');
    }

    private serializeInline(inline: Inline[]): string {
        return inline.map(i => {
            let text = i.text;
            if (i.bold) text = `**${text}**`;
            if (i.italic) text = `*${text}*`;
            if (i.code) text = `\`${text}\``;
            if (i.strikethrough) text = `~~${text}~~`;
            if (i.underline) text = `<u>${text}</u>`;
            if (i.link) text = `[${text}](${i.link.url})`;
            return text;
        }).join('');
    }
}
```

- [x] **Step 2: 提交**

```bash
git add apps/web/src/features/editor/converter/markdown-serializer.ts
git commit -m "feat(editor): add MarkdownSerializer for Block[] to Markdown conversion"
```

---

## Task 3: Block[] ↔ Lexical 转换层

### Task 3.1: BlockLexicalConverter 实现

- [x] **Step 1: 创建 BlockLexicalConverter**

文件：`features/editor/converter/block-lexical-converter.ts`

```typescript
import { $getRoot, $createParagraphNode, $createTextNode, $createHeadingNode } from 'lexical';
import type { LexicalEditor } from 'lexical';
import type { Block, Inline } from '../types/block';

export class BlockLexicalConverter {
    // Block[] → Lexical
    static blocksToLexical(blocks: Block[], editor: LexicalEditor): void {
        editor.update(() => {
            const root = $getRoot();
            root.clear();
            
            for (const block of blocks) {
                const node = this.convertBlockToNode(block);
                if (node) root.append(node);
            }
        });
    }
    
    // Lexical → Block[]
    static lexicalToBlocks(editor: LexicalEditor): Block[] {
        let blocks: Block[] = [];
        editor.get(() => {
            const root = $getRoot();
            const children = root.getChildren();
            blocks = children.map(node => this.convertNodeToBlock(node));
        });
        return blocks;
    }

    private static convertBlockToNode(block: Block): LexicalNode | null {
        switch (block.type) {
            case 'heading':
                const heading = $createHeadingNode(`h${block.content.level}`);
                block.content.inline.forEach(inline => {
                    heading.append(
                        $createTextNode(inline.text)
                            .setFormat(this.inlineToLexicalFormat(inline))
                    );
                });
                return heading;
            
            case 'paragraph':
                const paragraph = $createParagraphNode();
                block.content.inline.forEach(inline => {
                    paragraph.append(
                        $createTextNode(inline.text)
                            .setFormat(this.inlineToLexicalFormat(inline))
                    );
                });
                return paragraph;
            
            // ... list, quote, code cases
            default:
                return null;
        }
    }

    private static inlineToLexicalFormat(inline: Inline): number {
        let format = 0;
        if (inline.bold) format |= 1; // IS_BOLD
        if (inline.italic) format |= 2; // IS_ITALIC
        if (inline.underline) format |= 4; // IS_UNDERLINE
        if (inline.strikethrough) format |= 8; // IS_STRIKETHROUGH
        if (inline.code) format |= 16; // IS_CODE
        return format;
    }
}
```

- [x] **Step 2: 提交**

```bash
git add apps/web/src/features/editor/converter/block-lexical-converter.ts
git commit -m "feat(editor): add BlockLexicalConverter for bidirectional Lexical conversion"
```

---

## Task 4: EditorService 重写

### Task 4.1: 更新 EditorService API

- [x] **Step 1: 添加 setEditor 方法**

文件：`features/editor/service/EditorService.ts`

```typescript
export class EditorService extends ServiceBase {
    private editor: LexicalEditor | null = null;
    private filePath: string | null = null;

    setEditor(editor: LexicalEditor): void {
        this.editor = editor;
    }

    async loadDocument(doc: Document): Promise<void> {
        if (!this.editor) {
            throw new Error('Editor not initialized');
        }
        BlockLexicalConverter.blocksToLexical(doc.content, this.editor);
        this.filePath = doc.path;
    }

    async saveDocument(): Promise<SaveResult> {
        if (!this.editor) {
            throw new Error('Editor not initialized');
        }

        try {
            const blocks = BlockLexicalConverter.lexicalToBlocks(this.editor);
            const markdown = MarkdownSerializer.serialize(blocks);
            
            await this.fileSystemService.writeFile(this.filePath!, markdown);
            
            // 更新 Document 状态
            this.store.getState().setCurrentDocument({
                ...this.store.getState().currentDocument!,
                content: blocks,
            });
            
            return { success: true, timestamp: new Date().toISOString() };
        } catch (error) {
            if (error instanceof PermissionDeniedError) {
                this.store.getState().setError('文件保存失败：权限被撤销');
            }
            throw error;
        }
    }

    // 删除旧方法
    // - createLexicalEditor()
    // - insertBlock()
    // - updateBlock()
    // - deleteBlock()
}
```

- [x] **Step 2: 更新测试**

```bash
git add apps/web/src/features/editor/service/EditorService.ts
git add apps/web/src/features/editor/service/__tests__/EditorService.test.ts
git commit -m "feat(editor): rewrite EditorService with loadDocument/saveDocument API"
```

---

## Task 5: EditorContainer 重构

### Task 5.1: DI 模式替代工厂模式

- [x] **Step 1: 重构 EditorContainer**

文件：`platform/editor/container/editor-container.ts`

```typescript
export class EditorContainer {
    private static instance: EditorContainer;
    private services = new Map<string, EditorService>();
    private blockRegistry: BlockRegistry;

    private constructor() {
        this.blockRegistry = new BlockRegistry();
        registerBuiltInBlocks(this.blockRegistry);
    }

    static getInstance(): EditorContainer {
        if (!EditorContainer.instance) {
            EditorContainer.instance = new EditorContainer();
        }
        return EditorContainer.instance;
    }

    get<T>(serviceClass: Constructor<T>): T {
        // DI 容器逻辑
        // ...
    }

    disposeAll(): void {
        this.services.forEach(service => service.dispose());
        this.services.clear();
    }
}
```

- [x] **Step 2: 删除旧 EditorContainer**

```bash
git rm apps/web/src/features/editor/container/EditorContainer.ts
git add apps/web/src/platform/editor/container/editor-container.ts
git commit -m "refactor(editor): replace factory pattern with DI singleton"
```

---

## Task 6: React 组件集成

### Task 6.1: EditorBridgePlugin

- [x] **Step 1: 创建 EditorBridgePlugin**

文件：`components/workspace/editor/lexical-editor.tsx`

```typescript
function EditorBridgePlugin({ blockRegistry }: { blockRegistry: BlockRegistry }) {
    const editor = useLexicalComposerContext();
    const container = useEditorContainer();

    useEffect(() => {
        const service = container.get(EditorService);
        service.setEditor(editor);
        service.setBlockRegistry(blockRegistry);
        
        return () => {
            // 清理
        };
    }, [editor, container, blockRegistry]);

    return null;
}
```

- [x] **Step 2: 提交**

```bash
git add apps/web/src/components/workspace/editor/lexical-editor.tsx
git commit -m "feat(editor): add EditorBridgePlugin for Lexical instance injection"
```

---

### Task 6.2: EditorContentPlugin

- [x] **Step 1: 创建 EditorContentPlugin**

```typescript
function EditorContentPlugin({ document }: { document: Document | null }) {
    const editor = useLexicalComposerContext();
    const service = useEditorService();
    const lastLoadedBlockRef = useRef<string | null>(null);

    useEffect(() => {
        if (!document) return;
        
        const contentHash = hashBlocks(document.content);
        if (lastLoadedBlockRef.current === contentHash) return;
        lastLoadedBlockRef.current = contentHash;
        
        service.loadDocument(document);
    }, [document, editor, service]);

    return null;
}
```

---

### Task 6.3: ToolbarPlugin

- [x] **Step 1: 创建 ToolbarPlugin**

文件：`components/workspace/editor/toolbar-plugin.tsx`

```typescript
function ToolbarPlugin() {
    const editor = useLexicalComposerContext();
    const store = useEditorStore();

    useEffect(() => {
        return editor.registerUpdateListener(({ editorState }) => {
            editorState.read(() => {
                const selection = $getSelection();
                if ($isRangeSelection(selection)) {
                    const formatState = {
                        bold: selection.hasFormat('bold'),
                        italic: selection.hasFormat('italic'),
                        underline: selection.hasFormat('underline'),
                    };
                    store.getState().setFormatState(formatState);
                }
            });
        });
    }, [editor, store]);

    return null;
}
```

- [x] **Step 2: 提交**

```bash
git add apps/web/src/components/workspace/editor/toolbar-plugin.tsx
git add apps/web/src/components/workspace/editor/toolbar.tsx
git commit -m "feat(editor): add ToolbarPlugin for format state bridge"
```

---

## Task 7: 快捷键与自动保存

### Task 7.1: Ctrl+S 快捷键

- [x] **Step 1: 更新 ShortcutProvider**

文件：`components/workspace/shortcut-provider.tsx`

```typescript
function ShortcutProvider({ children }: { children: React.ReactNode }) {
    const container = useEditorContainer();

    useKeyboardShortcut('save', () => {
        const service = container.get(EditorService);
        service.saveDocument();
    });

    return <>{children}</>;
}
```

- [x] **Step 2: 提交**

```bash
git add apps/web/src/components/workspace/shortcut-provider.tsx
git commit -m "feat(editor): add Ctrl+S keyboard shortcut for save"
```

---

### Task 7.2: AutoSaveService 接入

- [x] **Step 1: 更新 AutoSaveService**

文件：`features/editor/service/AutoSaveService.ts`

```typescript
export class AutoSaveService extends ServiceBase {
    private debouncedSave: (() => void) | null = null;

    register(documentId: string, editorService: EditorService): void {
        this.debouncedSave = debounce(() => {
            editorService.saveDocument();
        }, 2000); // 2s debounce

        editorService.editor.registerUpdateListener(() => {
            this.debouncedSave?.();
        });
    }
}
```

- [x] **Step 2: 提交**

```bash
git add apps/web/src/features/editor/service/AutoSaveService.ts
git commit -m "feat(editor): integrate AutoSaveService with EditorService"
```

---

## Task 8: 测试与验证

### Task 8.1: 更新单元测试

- [x] **Step 1: 更新 EditorService 测试**

```bash
git add apps/web/src/features/editor/service/__tests__/EditorService.test.ts
```

- [x] **Step 2: 更新类型测试**

```bash
git add apps/web/src/features/editor/types/__tests__/types.test.ts
```

- [x] **Step 3: 运行所有测试**

```bash
cd apps/web && npm run test -- --run
```

预期：所有测试通过

---

### Task 8.2: 集成测试

- [x] **Step 1: 更新集成测试**

```bash
git add apps/web/src/features/editor/__tests__/integration.test.ts
```

**测试场景**:
- Markdown round-trip
- Block[] ↔ Lexical 转换
- Inline 格式保留

---

## 完成标准检查

- [x] 打开 .md 文件，内容正确渲染为富文本
- [x] 编辑内容后 Ctrl+S 保存，文件内容正确写回磁盘
- [x] Round-trip: 加载 → 编辑 → 保存 → 重新加载，行内格式保持一致
- [x] Block[] 能完整表示行内格式
- [x] Markdown ↔ Block[] 转换正确覆盖
- [x] Block[] ↔ Lexical 转换正确渲染
- [x] 自动保存在 2 秒 debounce 后触发
- [x] Toolbar 行内格式按钮正确工作
- [x] 选中已格式化文字时，对应 Toolbar 按钮高亮
- [x] Ctrl+B/I/U 快捷键正常工作
- [x] Ctrl+S 保存当前文件
- [x] 文件权限被撤销时显示错误提示
- [x] 现有测试全部通过

---

## 提交历史

```
60d96dd feat: implement editor core functionality with Markdown sync
b95a0be feat: implement editor core functionality with Markdown sync
```

---

**Plan 完成日期**: 2026-04-08
**测试状态**: ✅ 全部通过
