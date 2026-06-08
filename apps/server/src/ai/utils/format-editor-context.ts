/**
 * formatEditorContext — 将编辑器上下文格式化为 LLM 可读的字符串
 *
 * 将前端 collectEditorContext() 收集的编辑器状态（选中文本、文档内容、光标位置等）
 * 格式化为 <editor_context> XML 块，作为带 hide_from_ui 标记的 SystemMessage
 * 注入到 LangGraph 消息流。
 *
 * 设计决策：
 * - 纯函数，无副作用，方便独立测试
 * - 空输入返回空字符串，零 token 开销
 * - 总输出控制在 ~3000 字符内（~750 tokens）
 * - 结构化数据走 XML 属性（短、token 省），正文走子元素（可含特殊字符）
 * - selection / excerpt 内容必须经过 XML 转义，避免破坏标签结构
 */

/** 最大选中文本长度 */
const MAX_SELECTED_TEXT = 2000;
/** 文档摘要前缀长度 */
const EXCERPT_PREFIX = 1000;
/** 选区上下文窗口半径 */
const SELECTION_WINDOW = 500;

export interface FormattedEditorContext {
    /** 格式化后的字符串，无有效上下文时为空字符串 */
    formatted: string;
}

/**
 * 将编辑器上下文格式化为 LLM 可读的 XML 字符串
 *
 * 输出形如：
 * ```xml
 * <editor_context>
 *   <document title="..." path="..." id="..." />
 *   <selection truncated="false">selected text</selection>
 *   <cursor block_id="..." offset="42" />
 *   <excerpt full_length="5000" truncated="true">
 *     <prefix>first 1000 chars...</prefix>
 *     <selection_window offset="1500">text around selection</selection_window>
 *   </excerpt>
 * </editor_context>
 * ```
 *
 * @param context 前端传来的编辑器上下文对象
 * @returns 格式化结果，formatted 为空字符串表示无有效上下文
 */
export function formatEditorContext(
    context: Record<string, unknown> | undefined | null,
): FormattedEditorContext {
    if (!context || typeof context !== 'object') {
        return { formatted: '' };
    }

    const children: string[] = [];

    // <document />
    const docAttrs = collectDocAttrs(context);
    if (Object.keys(docAttrs).length > 0) {
        children.push(`  <document ${renderAttrs(docAttrs)} />`);
    }

    // <selection>
    const selectedText = asString(context.selectedText);
    if (selectedText) {
        const truncated = selectedText.length > MAX_SELECTED_TEXT;
        const text = truncated ? selectedText.slice(0, MAX_SELECTED_TEXT) : selectedText;
        children.push(`  <selection truncated="${truncated}">${escapeXml(text)}</selection>`);
    }

    // <cursor />
    const cursorAttrs = collectCursorAttrs(context.cursorPosition);
    if (cursorAttrs) {
        children.push(`  <cursor ${renderAttrs(cursorAttrs)} />`);
    }

    // <excerpt> ... </excerpt>
    const fullContent = asString(context.fullContent);
    if (fullContent) {
        children.push(renderExcerpt(fullContent, selectedText));
    }

    if (children.length === 0) {
        return { formatted: '' };
    }

    return {
        formatted: `<editor_context>\n${children.join('\n')}\n</editor_context>`,
    };
}

/**
 * 收集 document 标签的属性：title / path / id
 */
function collectDocAttrs(context: Record<string, unknown>): Record<string, string> {
    const attrs: Record<string, string> = {};
    const title = asString(context.documentTitle);
    const path = asString(context.documentPath);
    const id = asString(context.documentId);
    if (title) attrs.title = title;
    if (path) attrs.path = path;
    if (id) attrs.id = id;
    return attrs;
}

/**
 * 收集 cursor 标签的属性：block_id / offset
 * 返回 null 表示无有效光标信息（不输出 <cursor /> 标签）
 */
function collectCursorAttrs(cursorPosition: unknown): Record<string, string> | null {
    if (!cursorPosition || typeof cursorPosition !== 'object') {
        return null;
    }
    const cp = cursorPosition as Record<string, unknown>;
    const blockId = asString(cp.blockId);
    const offset = typeof cp.offset === 'number' ? cp.offset : undefined;
    if (!blockId && offset === undefined) {
        return null;
    }
    return {
        block_id: blockId ?? 'unknown',
        offset: String(offset ?? 0),
    };
}

/**
 * 渲染 <excerpt> 块：前缀 + 可选的选区窗口
 */
function renderExcerpt(fullContent: string, selectedText: string | null): string {
    const fullLength = fullContent.length;
    const truncated = fullLength > EXCERPT_PREFIX;
    const prefixText = truncated ? fullContent.slice(0, EXCERPT_PREFIX) : fullContent;

    const lines: string[] = [];
    lines.push(`  <excerpt full_length="${fullLength}" truncated="${truncated}">`);
    lines.push(`    <prefix>${escapeXml(prefixText)}</prefix>`);

    // 选区窗口：仅当选中文本存在且不在前缀范围内时输出
    if (selectedText) {
        const selectionIndex = fullContent.indexOf(selectedText);
        if (selectionIndex >= 0 && selectionIndex > EXCERPT_PREFIX) {
            const windowStart = Math.max(0, selectionIndex - SELECTION_WINDOW);
            const windowEnd = Math.min(
                fullContent.length,
                selectionIndex + selectedText.length + SELECTION_WINDOW,
            );
            const windowText = fullContent.slice(windowStart, windowEnd);
            lines.push(
                `    <selection_window offset="${selectionIndex}">${escapeXml(windowText)}</selection_window>`,
            );
        }
    }

    lines.push('  </excerpt>');
    return lines.join('\n');
}

/**
 * 渲染属性键值对为 `key="value"` 字符串，自动转义属性值
 */
function renderAttrs(attrs: Record<string, string>): string {
    return Object.entries(attrs)
        .map(([k, v]) => `${k}="${escapeAttr(v)}"`)
        .join(' ');
}

/**
 * 转义 XML 元素 textContent 中的特殊字符
 * 必须先转义 & ，再转义 < 和 >，否则会双重转义
 */
function escapeXml(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * 转义 XML 属性值中的特殊字符
 * 在 escapeXml 基础上额外转义双引号
 */
function escapeAttr(s: string): string {
    return escapeXml(s).replace(/"/g, '&quot;');
}

/**
 * 安全提取字符串值，空字符串视为 null
 */
function asString(value: unknown): string | null {
    if (typeof value === 'string' && value.length > 0) {
        return value;
    }
    return null;
}
