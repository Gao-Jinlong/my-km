# 重构计划：移除 Editor Zustand Store

**日期**: 2026-04-09
**状态**: PENDING
**分支**: main

---

## 一、重构目标

移除 `features/editor/store/editor-store.ts` 及其相关 Zustand 代码，改用 **Lexical 原生状态 + 事件发射器模式** 替代。

### 重构动机

1. **状态源不清晰** — 当前有三种状态来源（Lexical EditorState / Zustand store / EditorService 内部状态），边界模糊
2. **Zustand store 未被充分利用** — 没有组件真正订阅 store，实际使用直接服务访问或 EditorTabService
3. **增加不必要的复杂度** — 需要在 Lexical ↔ Zustand ↔ EditorService 之间同步状态
4. **违背单一状态源原则** — Lexical EditorState 应该是权威来源

---

## 二、架构设计

### 2.1 重构后架构

```
┌─────────────────────────────────────────────┐
│  React 组件 (lexical-editor.tsx)             │
│  - useLexicalComposerContext() 获取 editor   │
│  - registerUpdateListener 监听状态变化        │
│  - useState 管理本地 UI 状态                   │
├─────────────────────────────────────────────┤
│  Lexical EditorState (单一权威来源)           │
│  - 文档内容 (RootNode → Block 节点)            │
│  - Selection ($getSelection())               │
│  - FormatState (selection.hasFormat())       │
├─────────────────────────────────────────────┤
│  EditorService (无状态业务逻辑层)             │
│  - loadDocument: Block[] → Lexical           │
│  - saveDocument: Lexical → Block[] → 文件     │
│  - onChangeEmitter: 通知外部状态变化          │
└─────────────────────────────────────────────┘
```

### 2.2 状态迁移映射

| 原 Zustand 状态 | 新来源 |
|----------------|--------|
| `document` | 从父组件 props 传递 |
| `selection` | `editor.getEditorState().read(() => $getSelection())` |
| `formatState` | `selection.hasFormat('bold')` 等 |
| `isDirty` | EditorService 内部标记 + onChange 事件 |
| `isLoading` | React `useState<boolean>` |
| `error` | React `useState<string \| null>` |
| `status` | 从 `isDirty` + `isLoading` 推导 |
| `isReadonly` | React `useState<boolean>` / 从文档权限推导 |

### 2.3 多实例支持

每个打开的文件 = 一个 EditorService 实例：

```
打开 3 个文件:
┌─────────────────────────────────────────┐
│  Tab 1: file1.md                        │
│  ├─ LexicalComposer #1                  │
│  ├─ LexicalEditor #1                    │
│  ├─ EditorService #1                    │
│  └─ onChangeEmitter #1 (独立)            │
├─────────────────────────────────────────┤
│  Tab 2: file2.md                        │
│  ├─ LexicalComposer #2                  │
│  ├─ LexicalEditor #2                    │
│  ├─ EditorService #2                    │
│  └─ onChangeEmitter #2 (独立)            │
└─────────────────────────────────────────┘
```

---

## 三、修改清单

### 3.1 需要修改的文件

| 文件 | 变更描述 |
|------|----------|
| `features/editor/service/EditorService.ts` | 移除 `store` 属性和依赖，添加 `onChangeEmitter` 和状态 getter/setter |
| `features/editor/container/editor-container.ts` | 适配新的 EditorService 构造函数（移除 store 参数） |
| `components/workspace/editor/lexical-editor.tsx` | 移除 store 相关导入，用 React state + listener 替代 |
| `components/workspace/editor/document-status-indicator.tsx` | 适配事件订阅模式 |
| `components/workspace/editor/toolbar-plugin.tsx` | 从 Lexical selection 直接读取 formatState |
| `features/editor/service/__tests__/EditorService.test.ts` | 更新测试，移除 store 相关 mock |

### 3.2 需要删除的文件

| 文件 | 说明 |
|------|------|
| `features/editor/store/editor-store.ts` | Zustand store 实现 |
| `features/editor/store/__tests__/editor-store.test.ts` | store 测试 |
| `features/editor/store/index.ts` | 删除或改为空 re-export |

---

## 四、详细实现

### 4.1 EditorService 重构

```typescript
/**
 * EditorService - 单个编辑器的业务逻辑服务
 */

import { Emitter } from '@/base/common/event';
import { ServiceBase } from '@/platform/base/service-base';
// ... 其他导入

export interface EditorService {
    documentId: string;
    filePath: string;
    readonly isDisposed: boolean;
    
    // 事件
    readonly onChange: Event<void>;
    
    // 编辑器实例
    setEditor(editor: LexicalEditor): void;
    getEditor(): LexicalEditor | null;
    
    // 文档操作
    loadDocument(doc: Document): void;
    saveDocument(): Promise<SaveResult>;
    
    // 状态获取
    getState(): EditorState;
    getSelection(): Selection | null;
    getSelectedText(): string | null;
    getFullContent(): string;
    getFormatState(): FormatState;
    
    // 生命周期
    destroy(): void;
}

interface EditorState {
    isDirty: boolean;
    isSaving: boolean;
    hasError: boolean;
    isReadonly: boolean;
    error: string | null;
}

class EditorServiceImpl extends ServiceBase implements EditorService {
    documentId: string;
    filePath: string;
    
    // 事件发射器
    private readonly _onChange = new Emitter<void>();
    readonly onChange = this._onChange.event;
    
    // 内部状态
    private editor: LexicalEditor | null = null;
    private disposed: boolean = false;
    private isDirty = false;
    private isSaving = false;
    private error: string | null = null;
    private isReadonly = false;
    
    get isDisposed(): boolean {
        return this.disposed;
    }
    
    constructor(documentId: string, filePath: string) {
        super();
        this.documentId = documentId;
        this.filePath = filePath;
    }
    
    // ========== 状态 getter ==========
    
    getState(): EditorState {
        return {
            isDirty: this.isDirty,
            isSaving: this.isSaving,
            hasError: this.error !== null,
            isReadonly: this.isReadonly,
            error: this.error,
        };
    }
    
    getFormatState(): FormatState {
        if (!this.editor) {
            return createEmptyFormatState();
        }
        
        return this.editor.getEditorState().read(() => {
            const selection = $getSelection();
            if (!$isRangeSelection(selection)) {
                return createEmptyFormatState();
            }
            return {
                bold: selection.hasFormat('bold'),
                italic: selection.hasFormat('italic'),
                underline: selection.hasFormat('underline'),
                code: selection.hasFormat('code'),
                strikethrough: selection.hasFormat('strikethrough'),
                subscript: selection.hasFormat('subscript'),
                superscript: selection.hasFormat('superscript'),
                highlight: selection.hasFormat('highlight'),
            };
        });
    }
    
    // ========== 状态 setter ==========
    
    private markDirty(): void {
        this.isDirty = true;
        this._onChange.fire();
    }
    
    private setSaving(saving: boolean): void {
        this.isSaving = saving;
        this._onChange.fire();
    }
    
    private setError(error: string | null): void {
        this.error = error;
        this._onChange.fire();
    }
    
    // ========== 编辑器实例 ==========
    
    setEditor(editor: LexicalEditor): void {
        this.editor = editor;
    }
    
    getEditor(): LexicalEditor | null {
        return this.editor;
    }
    
    // ========== 文档操作 ==========
    
    loadDocument(doc: Document): void {
        if (this.disposed) {
            throw new Error('EditorService has been destroyed');
        }
        
        try {
            this.isReadonly = false;
            this.isDirty = false;
            this.error = null;
            this._onChange.fire();
            
            // 将文档内容加载到 Lexical 编辑器
            if (this.editor) {
                blocksToLexical(doc.content, this.editor);
            }
        } catch (error) {
            const errorMessage = error instanceof Error 
                ? error.message 
                : 'Failed to load document';
            this.setError(errorMessage);
            throw error;
        }
    }
    
    async saveDocument(): Promise<SaveResult> {
        if (this.disposed) {
            return {
                success: false,
                error: 'EditorService has been destroyed',
            };
        }
        
        if (this.isReadonly) {
            return {
                success: false,
                error: 'Document is in readonly mode',
            };
        }
        
        try {
            if (!this.editor) {
                return {
                    success: false,
                    error: 'Editor not initialized',
                };
            }
            
            this.setSaving(true);
            
            // 从 Lexical 获取当前内容
            const blocks = lexicalToBlocks(this.editor);
            
            // 更新文档
            const currentDoc = /* 从外部传入或缓存 */ null;
            if (!currentDoc) {
                return {
                    success: false,
                    error: 'No document loaded',
                };
            }
            
            const updatedDoc: Document = {
                ...currentDoc,
                content: blocks,
                version: currentDoc.version + 1,
                updatedAt: new Date().toISOString(),
            };
            
            // 序列化并写入文件
            let fileContent: string;
            if (updatedDoc.type === 'km') {
                fileContent = serializeToKmFile(blocks, {
                    title: updatedDoc.title,
                    createdAt: updatedDoc.createdAt,
                    updatedAt: updatedDoc.updatedAt,
                });
            } else {
                fileContent = serializeToMarkdown(blocks);
            }
            
            const fileSystem = container.get(FileSystemService);
            await fileSystem.writeFile(this.filePath, fileContent);
            
            this.isDirty = false;
            this._onChange.fire();
            
            return {
                success: true,
                document: updatedDoc,
            };
        } catch (error) {
            const errorMessage = error instanceof Error 
                ? error.message 
                : 'Failed to save document';
            this.setError(errorMessage);
            return {
                success: false,
                error: errorMessage,
            };
        } finally {
            this.isSaving = false;
            this._onChange.fire();
        }
    }
    
    // ========== 其他方法 ==========
    
    getSelection(): Selection | null {
        if (!this.editor) return null;
        
        let lexicalSelection: any = null;
        this.editor.getEditorState().read(() => {
            // TODO: 使用 @lexical/selection 获取选区
            lexicalSelection = null;
        });
        
        if (!lexicalSelection) return null;
        // TODO: 转换为 Selection 格式
        return null;
    }
    
    getSelectedText(): string | null {
        const selection = this.getSelection();
        return selection?.text ?? null;
    }
    
    getFullContent(): string {
        if (!this.editor) return '';
        
        return this.editor.getEditorState().read(() => {
            return $getRoot().getTextContent();
        });
    }
    
    destroy(): void {
        if (this.disposed) return;
        
        this.disposed = true;
        this._onChange.dispose();
        super.dispose();
    }
}

// 工厂函数
export function createEditorService(documentId: string, filePath: string): EditorService {
    return new EditorServiceImpl(documentId, filePath);
}
```

### 4.2 lexical-editor.tsx 重构

```typescript
// 移除 store 相关导入
// import { createEditorStore } from '@/features/editor/store/editor-store';

function EditorBridgePlugin({ documentId, filePath }: { documentId: string; filePath: string }) {
    const [editor] = useLexicalComposerContext();
    const editorServiceRef = useRef<ReturnType<typeof EditorContainer.prototype.createInstance> | null>(null);
    
    useEffect(() => {
        const editorContainer = container.get(EditorContainer);
        // 不再传入 store 参数
        editorServiceRef.current = editorContainer.createInstance(documentId, filePath);
        
        if (editorServiceRef.current) {
            editorServiceRef.current.setEditor(editor);
            registerEditorService(documentId, editorServiceRef.current);
        }
        
        return () => {
            if (editorServiceRef.current) {
                unregisterEditorService(documentId);
                editorContainer.disposeInstance(documentId);
            }
        };
    }, [documentId, filePath, editor]);
    
    return null;
}
```

### 4.3 document-status-indicator.tsx 重构

```typescript
export function DocumentStatusIndicator({ documentId }: { documentId: string }) {
    const [state, setState] = useState({
        isDirty: false,
        isSaving: false,
        hasError: false,
        isReadonly: false,
    });
    
    useEffect(() => {
        const editorService = editorServiceMap.get(documentId);
        if (!editorService) return;
        
        // 订阅事件
        const dispose = editorService.onChange(() => {
            setState(editorService.getState());
        });
        
        // 初始同步
        setState(editorService.getState());
        
        return () => dispose.dispose();
    }, [documentId]);
    
    const status = getStatusDisplay(
        state.isDirty,
        state.isReadonly,
        state.isSaving,
        state.hasError,
    );
    
    return (
        <div className={cn('...', status.className)}>
            <span>{status.icon}</span>
            <span>{status.text}</span>
        </div>
    );
}
```

---

## 五、测试更新

### 5.1 EditorService 测试更新点

```typescript
// features/editor/service/__tests__/EditorService.test.ts

describe('EditorService', () => {
    let service: EditorService;
    
    beforeEach(() => {
        // 不再需要传入 mock store
        service = createEditorService('test-doc', 'test.md');
    });
    
    afterEach(() => {
        service.destroy();
    });
    
    describe('onChange event', () => {
        it('should notify listeners when state changes', () => {
            const mockListener = jest.fn();
            service.onChange(mockListener);
            
            service.loadDocument({ /* ... */ });
            
            expect(mockListener).toHaveBeenCalled();
        });
    });
    
    describe('getState()', () => {
        it('should return current state', () => {
            const state = service.getState();
            expect(state.isDirty).toBe(false);
            expect(state.isSaving).toBe(false);
            expect(state.hasError).toBe(false);
        });
    });
});
```

---

## 六、执行步骤

1. [ ] 修改 `EditorService.ts` — 添加 `_onChange` emitter，移除 `store`
2. [ ] 修改 `EditorContainer.ts` — 适配新的构造函数
3. [ ] 修改 `lexical-editor.tsx` — 移除 store 相关代码
4. [ ] 修改 `document-status-indicator.tsx` — 适配事件订阅
5. [ ] 修改 `toolbar-plugin.tsx` — 确认 formatState 来源
6. [ ] 删除 `editor-store.ts` 和测试文件
7. [ ] 更新 `EditorService.test.ts`
8. [ ] 运行测试验证
9. [ ] 手动验证多标签页编辑

---

## 七、风险评估

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| 状态同步问题 | 高 | 确保 `loadDocument`/`saveDocument` 都触发 `onChange` |
| 多实例隔离 | 中 | 每个实例有独立 emitter，已验证 |
| 测试失败 | 中 | 更新测试适配新 API |
| 类型错误 | 低 | 逐步修改，TypeScript 会提示 |

---

## 八、成功标准

- [ ] 编译通过，无 TypeScript 错误
- [ ] 所有单元测试通过
- [ ] 单文件编辑功能正常
- [ ] 多标签页编辑功能正常
- [ ] 状态指示器正确显示
- [ ] Toolbar formatState 正确更新
- [ ] 保存功能正常

---

**下一步**: 执行重构步骤 1-9
