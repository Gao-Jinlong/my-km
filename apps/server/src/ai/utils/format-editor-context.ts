/**
 * formatEditorContext — 将编辑器上下文格式化为 LLM 可读的字符串
 *
 * 将前端 collectEditorContext() 收集的编辑器状态（选中文本、文档内容、光标位置等）
 * 格式化为 [Editor Context] 标记块，拼接到用户消息前面。
 *
 * 设计决策：
 * - 纯函数，无副作用，方便独立测试
 * - 空输入返回空字符串，零 token 开销
 * - 总输出控制在 ~3000 字符内（~750 tokens）
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
 * 将编辑器上下文格式化为 LLM 可读的字符串
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

    const sections: string[] = [];

    // 文档标识
    const documentTitle = asString(context.documentTitle);
    const documentPath = asString(context.documentPath);
    const documentId = asString(context.documentId);
    const docLabel = documentTitle || documentPath || documentId;
    if (docLabel) {
        sections.push(`Document: ${docLabel}`);
    }

    // 选中文本
    const selectedText = asString(context.selectedText);
    if (selectedText) {
        const truncated =
            selectedText.length > MAX_SELECTED_TEXT
                ? `${selectedText.slice(0, MAX_SELECTED_TEXT)}...`
                : selectedText;
        sections.push(`Selected text: "${truncated}"`);
    }

    // 光标位置
    const cursorPosition = context.cursorPosition;
    if (cursorPosition && typeof cursorPosition === 'object') {
        const cp = cursorPosition as Record<string, unknown>;
        const blockId = asString(cp.blockId);
        const offset = typeof cp.offset === 'number' ? cp.offset : undefined;
        if (blockId || offset !== undefined) {
            sections.push(`Cursor: ${blockId ?? 'unknown'} at offset ${offset ?? 0}`);
        }
    }

    // 文档内容摘要
    const fullContent = asString(context.fullContent);
    if (fullContent) {
        sections.push(`Document excerpt:\n${buildExcerpt(fullContent, selectedText)}`);
    }

    if (sections.length === 0) {
        return { formatted: '' };
    }

    return { formatted: `[Editor Context]\n${sections.join('\n')}` };
}

/**
 * 构建文档摘要：前缀 + 选区窗口
 */
function buildExcerpt(fullContent: string, selectedText: string | null): string {
    const parts: string[] = [];

    // 前缀部分
    if (fullContent.length <= EXCERPT_PREFIX) {
        parts.push(fullContent);
    } else {
        parts.push(`${fullContent.slice(0, EXCERPT_PREFIX)}...`);
    }

    // 选区上下文窗口（仅当选中文本存在且不在前缀范围内时）
    if (selectedText) {
        const selectionIndex = fullContent.indexOf(selectedText);
        if (selectionIndex >= 0 && selectionIndex > EXCERPT_PREFIX) {
            const windowStart = Math.max(0, selectionIndex - SELECTION_WINDOW);
            const windowEnd = Math.min(
                fullContent.length,
                selectionIndex + selectedText.length + SELECTION_WINDOW,
            );
            const window = fullContent.slice(windowStart, windowEnd);
            parts.push(`\n...[around selection]...\n${window}`);
        }
    }

    return parts.join('');
}

/**
 * 安全提取字符串值
 */
function asString(value: unknown): string | null {
    if (typeof value === 'string' && value.length > 0) {
        return value;
    }
    return null;
}
