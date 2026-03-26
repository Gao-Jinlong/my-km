# 编辑增强服务设计文档

**创建日期**: 2026-03-26
**状态**: 待实现
**批次**: 第三批（编辑增强层）

---

## 1. 概述

本文档描述项目编辑增强层两个服务的设计：
- 剪贴板服务 (ClipboardService)
- 拖拽服务 (DragDropService)

这两个服务提供专业编辑器的核心能力，支持富文本、文件、自定义格式等多种数据类型的复制粘贴和拖拽操作。

---

## 2. 剪贴板服务 (ClipboardService)

### 2.1 职责

- 统一管理系统剪贴板操作（复制、粘贴、剪切）
- 支持多种数据格式（纯文本、富文本 HTML、自定义 JSON、文件）
- 支持内部剪贴板（应用内专属格式）
- 支持复制多个内容（智能粘贴）
- 与系统剪贴板 API 集成

### 2.2 核心接口

```typescript
/**
 * 剪贴板数据项
 */
interface ClipboardItem {
    /** 数据 MIME 类型 */
    type: string;

    /** 数据内容 */
    data: string | Blob;

    /** 是否为内部格式（仅应用内有效） */
    internal?: boolean;
}

/**
 * 剪贴板内容
 */
interface ClipboardContent {
    /** 纯文本 */
    'text/plain'?: string;

    /** 富文本 HTML */
    'text/html'?: string;

    /** 自定义 JSON 数据 */
    'application/json'?: unknown;

    /** 文件列表 */
    files?: File[];

    /** 内部格式（应用专属） */
    'application/x-mykm-internal'?: {
        type: string;
        data: unknown;
        metadata?: Record<string, unknown>;
    };
}

/**
 * 复制选项
 */
interface CopyOptions {
    /** 是否同时写入系统剪贴板 */
    writeToSystem?: boolean;

    /** 优先级（用于智能粘贴） */
    priority?: number;
}

/**
 * 粘贴结果
 */
interface PasteResult {
    /** 获取纯文本 */
    getText(): string | null;

    /** 获取 HTML */
    getHtml(): string | null;

    /** 获取 JSON 数据 */
    getJson<T>(): T | null;

    /** 获取文件列表 */
    getFiles(): File[];

    /** 获取内部格式数据 */
    getInternal<T>(): T | null;

    /** 检查是否包含指定类型 */
    hasType(type: string): boolean;

    /** 获取所有可用类型 */
    getTypes(): string[];
}

/**
 * 剪贴板服务
 */
@Service({ singleton: true })
class ClipboardService extends ServiceBase {
    // 事件发射器
    private readonly _onCopy = new Emitter<ClipboardContent>();
    private readonly _onCut = new Emitter<ClipboardContent>();
    private readonly _onPaste = new Emitter<PasteResult>();

    /** 复制事件 */
    readonly onCopy = this._onCopy.event;

    /** 剪切事件 */
    readonly onCut = this._onCut.event;

    /** 粘贴事件 */
    readonly onPaste = this._onPaste.event;

    /**
     * 复制到剪贴板
     * @param content 要复制的内容
     * @param options 选项
     */
    copy(content: ClipboardContent, options?: CopyOptions): Promise<void>;

    /**
     * 剪切到剪贴板
     * @param content 要剪切的内容
     * @param options 选项
     */
    cut(content: ClipboardContent, options?: CopyOptions): Promise<void>;

    /**
     * 从剪贴板读取
     * @returns 粘贴结果
     */
    paste(): Promise<PasteResult>;

    /**
     * 读取系统剪贴板（外部复制的内容）
     * @returns 粘贴结果
     */
    readSystemClipboard(): Promise<PasteResult>;

    /**
     * 复制纯文本（快捷方法）
     */
    copyText(text: string): Promise<void>;

    /**
     * 复制富文本（快捷方法）
     */
    copyHtml(html: string, plainText?: string): Promise<void>;

    /**
     * 复制内部格式（快捷方法）
     */
    copyInternal<T>(type: string, data: T, metadata?: Record<string, unknown>): Promise<void>;

    /**
     * 是否有可粘贴内容
     */
    canPaste(): Promise<boolean>;

    /**
     * 清空剪贴板
     */
    clear(): void;

    override dispose(): void;
}
```

### 2.3 使用示例

```typescript
// 复制纯文本
await clipboardService.copyText('Hello World');

// 复制富文本（同时保留纯文本版本）
await clipboardService.copyHtml('<b>Bold</b> and <i>italic</i>', 'Bold and italic');

// 复制内部格式（应用内专属数据）
await clipboardService.copyInternal('block-ref', {
    blockId: 'block-123',
    blockType: 'paragraph',
    metadata: { createdAt: Date.now() },
});

// 复制多种格式（智能粘贴）
await clipboardService.copy({
    'text/plain': 'Product Name',
    'text/html': '<span class="product">Product Name</span>',
    'application/json': { productId: 'p-123', name: 'Product Name' },
});

// 粘贴（获取所有内容）
const pasteResult = await clipboardService.paste();

// 根据可用类型智能处理
if (pasteResult.hasType('application/x-mykm-internal')) {
    // 内部格式优先处理
    const internal = pasteResult.getInternal<{ type: string; data: unknown }>();
    handleInternalPaste(internal);
} else if (pasteResult.hasType('text/html')) {
    // 其次 HTML
    const html = pasteResult.getHtml();
    handleHtmlPaste(html);
} else if (pasteResult.hasType('text/plain')) {
    // 降级为纯文本
    const text = pasteResult.getText();
    handleTextPaste(text);
}

// 粘贴文件
const files = pasteResult.getFiles();
if (files.length > 0) {
    handleFilePaste(files);
}

// 读取系统剪贴板（用户从其他应用复制的内容）
const external = await clipboardService.readSystemClipboard();
const text = external.getText();
```

### 2.4 设计决策

| 决策点 | 选择 | 理由 |
|--------|------|------|
| 多格式支持 | 同时存储多种格式 | 粘贴时智能降级，兼容性好 |
| 内部格式 | application/x-mykm-internal | 应用内专属数据，不泄漏到外部 |
| 系统同步 | 默认同步 | 支持跨应用复制粘贴 |
| 事件通知 | onCopy/onCut/onPaste | 其他模块可监听并响应 |
| 优先级 | CopyOptions.priority | 支持智能粘贴时选择最优内容 |

### 2.5 与系统剪贴板 API 集成

```typescript
async copy(content: ClipboardContent, options: CopyOptions = {}): Promise<void> {
    // 更新内部剪贴板
    this.internalClipboard = content;

    // 同步到系统剪贴板（如果启用）
    if (options.writeToSystem !== false && navigator.clipboard) {
        try {
            const items: ClipboardItemData[] = [];

            if (content['text/plain']) {
                items.push(new ClipboardItem({
                    'text/plain': new Blob([content['text/plain']], { type: 'text/plain' }),
                }));
            }

            if (content['text/html']) {
                items.push(new ClipboardItem({
                    'text/html': new Blob([content['text/html']], { type: 'text/html' }),
                }));
            }

            if (content.files && content.files.length > 0) {
                for (const file of content.files) {
                    items.push(new ClipboardItem({
                        [file.type]: file,
                    }));
                }
            }

            if (items.length > 0) {
                await navigator.clipboard.write(items);
            }
        } catch (error) {
            console.warn('Failed to write to system clipboard:', error);
            // 降级：仅使用内部剪贴板
        }
    }

    // 触发事件
    this._onCopy.fire(content);
}

async readSystemClipboard(): Promise<PasteResult> {
    if (!navigator.clipboard) {
        throw new Error('Clipboard API not available');
    }

    try {
        const clipboardItems = await navigator.clipboard.read();
        const result = new PasteResultImpl();

        for (const item of clipboardItems) {
            for (const type of item.types) {
                const blob = await item.getType(type);
                const text = await blob.text();

                if (type === 'text/plain') {
                    result.plainText = text;
                } else if (type === 'text/html') {
                    result.html = text;
                }
            }
        }

        return result;
    } catch (error) {
        console.warn('Failed to read system clipboard:', error);
        // 返回内部剪贴板内容
        return this.internalClipboardResult;
    }
}
```

### 2.6 编辑器集成

```typescript
// 编辑器中的复制命令
shortcutService.register({
    id: 'editor.copy',
    shortcut: 'Ctrl+C',
    target: 'editor',
    handler: async (ctx) => {
        const editor = ctx.activeEditor;
        if (!editor) return;

        const selection = editor.getSelection();
        if (!selection) return;

        // 获取选区内容（多种格式）
        const content = await editor.exportSelection({
            formats: ['text/plain', 'text/html', 'application/json'],
        });

        // 添加内部格式
        content['application/x-mykm-internal'] = {
            type: 'selection',
            data: {
                blocks: selection.blocks,
                startOffset: selection.startOffset,
                endOffset: selection.endOffset,
            },
        };

        await clipboardService.copy(content);
    },
});

// 编辑器中的粘贴命令
shortcutService.register({
    id: 'editor.paste',
    shortcut: 'Ctrl+V',
    target: 'editor',
    handler: async (ctx) => {
        const editor = ctx.activeEditor;
        if (!editor) return;

        const pasteResult = await clipboardService.paste();

        // 智能处理粘贴
        if (pasteResult.hasType('application/x-mykm-internal')) {
            // 内部格式：直接插入块引用
            const internal = pasteResult.getInternal();
            await editor.insertBlockReference(internal.data);
        } else if (pasteResult.hasType('text/html')) {
            // HTML：清理后插入
            const html = pasteResult.getHtml();
            const cleaned = sanitizeHtml(html);
            await editor.insertHtml(cleaned);
        } else if (pasteResult.hasType('text/plain')) {
            // 纯文本：按行分割
            const text = pasteResult.getText();
            await editor.insertText(text);
        }

        // 文件粘贴
        const files = pasteResult.getFiles();
        for (const file of files) {
            await editor.insertFile(file);
        }
    },
});
```

---

## 3. 拖拽服务 (DragDropService)

### 3.1 职责

- 统一管理拖拽操作的源和目标
- 支持多种拖拽数据类型
- 支持拖拽预览和视觉效果
- 支持拖拽分组和条件判定
- 与系统拖拽 API 集成

### 3.2 核心接口

```typescript

/**
 * 拖拽数据
 */
interface DragData {
    /** 拖拽类型 */
    type: string;

    /** 拖拽内容 */
    data: unknown;

    /** 拖拽效果（移动/复制/链接） */
    effect: 'move' | 'copy' | 'link';

    /** 自定义拖拽图像（可选） */
    dragImage?: {
        element: HTMLElement;
        offsetX: number;
        offsetY: number;
    };
}

/**
 * 拖拽源配置
 */
interface DragSourceConfig<T = unknown> {
    /** 拖拽类型 */
    type: string;

    /** 获取拖拽数据 */
    getDragData: (event: DragEvent) => DragData | null;

    /** 拖拽开始回调 */
    onDragStart?: (event: DragEvent, data: T) => void;

    /** 拖拽结束回调 */
    onDragEnd?: (event: DragEvent, data: T) => void;

    /** 允许的操作 */
    allowedEffects?: Array<'move' | 'copy' | 'link'>;
}

/**
 * 拖拽目标配置
 */
interface DropTargetConfig<T = unknown> {
    /** 接受的拖拽类型 */
    acceptedTypes: string[];

    /** 是否接受该拖拽（条件判定） */
    canAccept?: (dragData: DragData) => boolean;

    /** 拖拽进入回调 */
    onDragEnter?: (event: DragEvent, data: T) => void;

    /** 拖拽离开回调 */
    onDragLeave?: (event: DragEvent, data: T) => void;

    /** 拖拽悬停回调 */
    onDragOver?: (event: DragEvent, data: T) => void;

    /** 放置回调 */
    onDrop?: (event: DragEvent, data: T) => void | Promise<void>;

    /** 放置区域高亮类名 */
    highlightClass?: string;
}

/**
 * 拖拽源句柄
 */
interface DragSourceHandle {
    /** 销毁拖拽源 */
    dispose(): void;
}

/**
 * 拖拽目标句柄
 */
interface DropTargetHandle {
    /** 销毁拖拽目标 */
    dispose(): void;

    /** 临时禁用 */
    disable(): void;

    /** 启用 */
    enable(): void;
}

/**
 * 当前拖拽状态
 */
interface CurrentDragState {
    /** 正在拖拽的数据 */
    data: DragData | null;

    /** 拖拽源元素 */
    sourceElement: HTMLElement | null;

    /** 当前悬停的目标元素 */
    targetElement: HTMLElement | null;

    /** 允许的操作 */
    allowedEffect: 'move' | 'copy' | 'link' | 'none';
}

/**
 * 拖拽服务
 */
@Service({ singleton: true })
class DragDropService extends ServiceBase {
    // 事件发射器
    private readonly _onDragStart = new Emitter<DragData>();
    private readonly _onDragEnd = new Emitter<void>();
    private readonly _onDrop = new Emitter<{ data: DragData; target: HTMLElement }>();

    /** 拖拽开始事件 */
    readonly onDragStart = this._onDragStart.event;

    /** 拖拽结束事件 */
    readonly onDragEnd = this._onDragEnd.event;

    /** 放置事件 */
    readonly onDrop = this._onDrop.event;

    /** 当前拖拽状态 */
    readonly currentDrag: CurrentDragState | null;

    /**
     * 注册拖拽源
     * @param element 拖拽源元素
     * @param config 配置
     * @returns 句柄
     */
    registerDragSource<T>(element: HTMLElement, config: DragSourceConfig<T>): DragSourceHandle;

    /**
     * 注册放置目标
     * @param element 放置目标元素
     * @param config 配置
     * @returns 句柄
     */
    registerDropTarget<T>(element: HTMLElement, config: DropTargetConfig<T>): DropTargetHandle;

    /**
     * 手动触发拖拽（编程式）
     * @param data 拖拽数据
     * @param event 鼠标事件
     */
    startDrag(data: DragData, event: MouseEvent): void;

    /**
     * 检查是否可放置
     * @param target 目标元素
     * @param data 拖拽数据
     */
    canDrop(target: HTMLElement, data: DragData): boolean;

    /**
     * 获取当前悬停的放置目标
     */
    getCurrentDropTarget(): HTMLElement | null;

    override dispose(): void;
}
```

### 3.3 使用示例

```typescript
// 注册文件树节点为拖拽源
function registerFileTreeDragDrop() {
    const nodes = document.querySelectorAll('.file-tree-node');

    nodes.forEach(node => {
        dragDropService.registerDragSource(node, {
            type: 'file-node',
            getDragData: (event) => {
                const nodeId = node.getAttribute('data-node-id');
                const nodeData = fileTreeStore.getNode(nodeId);

                return {
                    type: 'file-node',
                    data: {
                        nodeId,
                        path: nodeData.path,
                        type: nodeData.type,
                    },
                    effect: 'move',
                };
            },
            onDragStart: (event, data) => {
                node.classList.add('dragging');
            },
            onDragEnd: (event, data) => {
                node.classList.remove('dragging');
            },
        });
    });

    // 注册文件夹为放置目标
    const folders = document.querySelectorAll('.file-tree-folder');

    folders.forEach(folder => {
        dragDropService.registerDropTarget(folder, {
            acceptedTypes: ['file-node'],
            canAccept: (dragData) => {
                // 不能移动到自身或子节点
                const folderPath = folder.getAttribute('data-path');
                const draggedPath = dragData.data.path;
                return !draggedPath.startsWith(folderPath);
            },
            onDragEnter: (event) => {
                folder.classList.add('drop-highlight');
            },
            onDragLeave: (event) => {
                folder.classList.remove('drop-highlight');
            },
            onDragOver: (event) => {
                event.preventDefault();
                event.dataTransfer.dropEffect = 'move';
            },
            onDrop: async (event, data) => {
                folder.classList.remove('drop-highlight');

                const targetPath = folder.getAttribute('data-path');
                const sourcePath = data.data.path;

                await fileSystemService.renameFile(
                    sourcePath,
                    `${targetPath}/${path.basename(sourcePath)}`
                );
            },
            highlightClass: 'drop-active',
        });
    });
}

// 编辑器块拖拽
function registerEditorBlockDragDrop() {
    const blocks = document.querySelectorAll('.editor-block');

    blocks.forEach(block => {
        dragDropService.registerDragSource(block, {
            type: 'editor-block',
            getDragData: (event) => {
                const blockId = block.getAttribute('data-block-id');
                return {
                    type: 'editor-block',
                    data: { blockId },
                    effect: 'move',
                    dragImage: {
                        element: block.cloneNode(true) as HTMLElement,
                        offsetX: 20,
                        offsetY: 20,
                    },
                };
            },
        });

        dragDropService.registerDropTarget(block, {
            acceptedTypes: ['editor-block'],
            canAccept: (dragData) => {
                // 不能移动到自身之前/之后
                const blockId = block.getAttribute('data-block-id');
                return dragData.data.blockId !== blockId;
            },
            onDragOver: (event) => {
                event.preventDefault();
                // 显示插入指示线
                const rect = block.getBoundingClientRect();
                const isBefore = event.clientY < rect.top + rect.height / 2;
                block.classList.toggle('drop-before', isBefore);
                block.classList.toggle('drop-after', !isBefore);
            },
            onDragLeave: (event) => {
                block.classList.remove('drop-before', 'drop-after');
            },
            onDrop: async (event, data) => {
                block.classList.remove('drop-before', 'drop-after');

                const targetBlockId = block.getAttribute('data-block-id');
                const sourceBlockId = data.data.blockId;
                const isBefore = event.clientY < block.getBoundingClientRect().top + block.getBoundingClientRect().height / 2;

                await editorService.moveBlock(sourceBlockId, targetBlockId, isBefore ? 'before' : 'after');
            },
        });
    });
}

// 监听全局拖拽事件
dragDropService.onDragStart((data) => {
    console.log('Drag started:', data);
    // 更新 UI 状态
    dragDropStore.setDragging(true);
});

dragDropService.onDragEnd(() => {
    console.log('Drag ended');
    // 清除 UI 状态
    dragDropStore.setDragging(false);
});
```

### 3.4 设计决策

| 决策点 | 选择 | 理由 |
|--------|------|------|
| 拖拽 API | 原生 HTML5 DragDrop | 浏览器原生支持，无障碍友好 |
| 数据类型 | type + data 分离 | 灵活支持多种数据类型 |
| 条件判定 | canAccept 回调 | 灵活控制接受逻辑 |
| 视觉效果 | highlightClass + 事件 | 灵活定制高亮样式 |
| 拖拽图像 | dragImage 选项 | 支持自定义拖拽预览 |

### 3.5 拖拽图像自定义

```typescript
// 使用截图作为拖拽图像
function createDragImage(element: HTMLElement): HTMLElement {
    const clone = element.cloneNode(true) as HTMLElement;
    clone.style.position = 'absolute';
    clone.style.top = '-9999px';
    clone.style.opacity = '0.8';
    clone.style.width = element.offsetWidth + 'px';
    document.body.appendChild(clone);

    return clone;
}

// 注册时设置
dragDropService.registerDragSource(element, {
    type: 'block',
    getDragData: (event) => ({
        type: 'block',
        data: { id: element.dataset.id },
        effect: 'move',
        dragImage: {
            element: createDragImage(element),
            offsetX: 10,
            offsetY: 10,
        },
    }),
});
```

---

## 4. 数据流

### 4.1 复制粘贴数据流

```
用户按下 Ctrl+C
    │
    ▼
ShortcutService 捕获
    │
    ▼
EditorService 获取选区内容（多格式）
    │
    ▼
ClipboardService.copy()
    │
    ├──► 写入内部剪贴板
    │
    └──► 同步到系统剪贴板
    │
    ▼
触发 onCopy 事件
    │
    ▼
UI 更新（复制成功提示）

---

用户按下 Ctrl+V
    │
    ▼
ShortcutService 捕获
    │
    ▼
ClipboardService.paste()
    │
    ├──► 读取系统剪贴板
    │
    └──► 合并内部剪贴板
    │
    ▼
EditorService 智能处理
    │
    ├──► 内部格式 → insertBlockReference
    ├──► HTML → insertHtml
    └──► 纯文本 → insertText
    │
    ▼
UndoRedoService 记录操作
```

### 4.2 拖拽数据流

```
用户按下鼠标并开始拖动
    │
    ▼
DragSource 触发 dragstart
    │
    ▼
DragDropService 获取 DragData
    │
    ▼
设置 system.dataTransfer
    │
    ▼
触发 onDragStart 事件
    │
    ▼
UI 显示拖拽图像

---

用户拖动经过 DropTarget
    │
    ▼
DropTarget 触发 dragenter
    │
    ▼
DragDropService 检查 canAccept
    │
    ├──► 接受 → 添加 highlightClass
    └──► 拒绝 → 无操作
    │
    ▼
DropTarget 触发 dragover
    │
    ▼
更新插入位置指示器

---

用户释放鼠标
    │
    ▼
DropTarget 触发 drop
    │
    ▼
执行 onDrop 回调
    │
    ▼
更新数据（移动/复制）
    │
    ▼
触发 onDrop 事件
    │
    ▼
清除高亮和指示器
```

---

## 5. 错误处理

### 5.1 剪贴板服务

| 错误场景 | 处理方式 |
|----------|----------|
| Clipboard API 不可用 | 降级到内部剪贴板，警告日志 |
| 权限被拒绝 | 显示错误通知，提供手动复制指引 |
| 数据格式不支持 | 跳过该格式，继续处理其他格式 |
| 文件读取失败 | 跳过该文件，继续处理其他文件 |

### 5.2 拖拽服务

| 错误场景 | 处理方式 |
|----------|----------|
| 拖拽类型不匹配 | canAccept 返回 false，视觉反馈拒绝 |
| onDrop 执行失败 | 回滚操作，显示错误通知 |
| 拖拽源/目标不存在 | 忽略，不抛错 |
| 拖拽图像创建失败 | 使用默认拖拽图像 |

---

## 6. 测试策略

### 6.1 单元测试

```typescript
// ClipboardService 测试
describe('ClipboardService', () => {
    it('应支持复制纯文本', async () => {
        await service.copyText('Hello');
        const result = await service.paste();
        expect(result.getText()).toBe('Hello');
    });

    it('应支持复制多格式', async () => {
        await service.copy({
            'text/plain': 'Plain',
            'text/html': '<b>HTML</b>',
        });

        const result = await service.paste();
        expect(result.getText()).toBe('Plain');
        expect(result.getHtml()).toBe('<b>HTML</b>');
    });

    it('应支持内部格式', async () => {
        await service.copyInternal('block-ref', { blockId: '123' });

        const result = await service.paste();
        expect(result.getInternal()).toEqual({ blockId: '123' });
    });

    it('应触发事件', () => {
        const copyMock = vi.fn();
        service.onCopy(copyMock);

        service.copyText('Test');

        expect(copyMock).toHaveBeenCalled();
    });
});

// DragDropService 测试
describe('DragDropService', () => {
    it('应支持注册拖拽源', () => {
        const element = document.createElement('div');
        const handle = service.registerDragSource(element, {
            type: 'test',
            getDragData: () => ({ type: 'test', data: {}, effect: 'move' }),
        });

        expect(handle).toBeDefined();
        handle.dispose();
    });

    it('应支持注册放置目标', () => {
        const element = document.createElement('div');
        const handle = service.registerDropTarget(element, {
            acceptedTypes: ['test'],
            onDrop: vi.fn(),
        });

        expect(handle).toBeDefined();
        handle.dispose();
    });

    it('应检查 canAccept', () => {
        const target = document.createElement('div');
        service.registerDropTarget(target, {
            acceptedTypes: ['test'],
            canAccept: (data) => data.data.valid === true,
        });

        expect(service.canDrop(target, { type: 'test', data: { valid: true }, effect: 'move' })).toBe(true);
        expect(service.canDrop(target, { type: 'test', data: { valid: false }, effect: 'move' })).toBe(false);
    });
});
```

### 6.2 集成测试

```typescript
// 编辑器复制粘贴集成测试
describe('Editor Copy/Paste Integration', () => {
    it('应支持编辑器内复制粘贴', async () => {
        // 设置编辑器内容
        editor.setContent('<p>Hello <b>World</b></p>');

        // 选择内容
        editor.setSelection({ start: 0, end: 11 });

        // 复制
        await clipboardService.copy(await editor.exportSelection());

        // 移动光标到末尾
        editor.setCursor(11);

        // 粘贴
        await clipboardService.paste();

        // 验证内容
        expect(editor.getContent()).toBe('<p>Hello <b>World</b>Hello <b>World</b></p>');
    });

    it('应支持跨编辑器复制粘贴', async () => {
        const editor1 = createEditor('editor1');
        const editor2 = createEditor('editor2');

        editor1.setContent('<p>Source</p>');
        editor1.setSelection({ start: 0, end: 7 });

        await clipboardService.copy(await editor1.exportSelection());

        editor2.setCursor(0);
        await clipboardService.paste();

        expect(editor2.getContent()).toBe('<p>Source</p>');
    });
});

// 文件树拖拽集成测试
describe('File Tree Drag/Drop Integration', () => {
    it('应支持文件移动到文件夹', async () => {
        const fileNode = document.querySelector('[data-path="/file.txt"]');
        const folderNode = document.querySelector('[data-path="/folder"]');

        // 模拟拖拽
        fireEvent.dragStart(fileNode);
        fireEvent.dragEnter(folderNode);
        fireEvent.dragOver(folderNode);
        fireEvent.drop(folderNode);
        fireEvent.dragEnd(fileNode);

        // 验证文件已移动
        await waitFor(() => {
            expect(fileSystemService.fileExists('/folder/file.txt')).resolves.toBe(true);
        });
    });
});
```

---

## 7. 实施顺序

1. **ClipboardService** - 独立实现，依赖较少
2. **DragDropService** - 独立实现，依赖较少

---

## 8. 与现有服务集成

### 8.1 依赖关系

```
ClipboardService ──┬──► NotificationService（错误提示）
                   └──► ShortcutService（快捷键命令）

DragDropService ───┬──► NotificationService（错误提示）
                   └──► FocusService（拖拽时聚焦）
```

### 8.2 与编辑器集成

```typescript
// EditorService 中使用 ClipboardService
class EditorService extends ServiceBase {
    constructor(
        private clipboard: ClipboardService,
        private undoRedo: UndoRedoService,
    ) {
        super();
    }

    async copySelection(): Promise<void> {
        const content = await this.exportSelection();
        await this.clipboard.copy(content);
    }

    async paste(): Promise<void> {
        const result = await this.clipboard.paste();

        // 创建撤销操作
        const op = new PasteOperation(this, result);
        this.undoRedo.push(this.documentId, op);

        // 执行粘贴
        await op.execute();
    }
}
```

---

## 9. 待决策事项

| 事项 | 状态 | 建议 |
|------|------|------|
| 内部剪贴板持久化 | 待确认 | 第一批不持久化，刷新清空 |
| 拖拽动画时长 | 待确认 | 建议 200ms |
| 文件粘贴大小限制 | 待确认 | 建议 10MB 单文件上限 |
| HTML 清理策略 | 待确认 | 使用 DOMPurify 库 |

---

## 10. 与后续批次的关系

### 依赖本服务的模块
- **块引用功能** → 依赖 ClipboardService 的内部格式
- **文件上传** → 依赖 DragDropService 的文件拖拽
- **富文本格式化** → 依赖 ClipboardService 的 HTML 复制

### 本服务依赖
- **NotificationService** → 错误提示
- **ShortcutService** → 快捷键触发复制粘贴
- **ThemeService** → 拖拽高亮样式
