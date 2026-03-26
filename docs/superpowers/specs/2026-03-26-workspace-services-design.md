# 工作区服务设计文档

**创建日期**: 2026-03-26
**状态**: 待实现
**批次**: 第四批（工作区层）

---

## 1. 概述

本文档描述项目工作区层两个服务的设计：
- 主题服务 (ThemeService)
- 焦点管理服务 (FocusService)

以及布局服务的設計：
- 布局服务 (LayoutService)

这些服务工作区级别的体验和状态管理。

---

## 2. 主题服务 (ThemeService)

### 2.1 职责

- 统一管理应用主题（浅色/深色/高对比度）
- 管理 CSS 变量和样式注入
- 支持主题切换动画
- 支持主题持久化
- 支持动态注册主题变量
- 支持组件级主题覆盖

### 2.2 核心接口

```typescript
/**
 * 主题轴定义
 */
type ThemeAxis = 'colorScheme' | 'density' | 'radius' | 'typography';

/**
 * 主题值定义
 */
interface ThemeValue {
    /** 变量名（不含前缀） */
    name: string;

    /** 变量值 */
    value: string | number;

    /** 所属轴 */
    axis?: ThemeAxis;

    /** 父变量（用于级联） */
    parent?: string;
}

/**
 * 主题定义
 */
interface ThemeDefinition {
    /** 主题唯一标识 */
    id: string;

    /** 主题名称（显示用） */
    name: string;

    /** 父主题（继承） */
    parent?: string;

    /** 主题变量 */
    variables: Record<string, string | number>;

    /** 主题元数据 */
    metadata?: {
        /** 是否是深色主题 */
        dark?: boolean;

        /** 主题图标 */
        icon?: string;

        /** 主题描述 */
        description?: string;
    };
}

/**
 * 主题变化事件
 */
interface ThemeChangeEvent {
    /** 之前的主题 ID */
    previousTheme: string;

    /** 新的主题 ID */
    newTheme: string;

    /** 变化的变量 */
    changedVariables: string[];
}

/**
 * 主题服务
 */
@Service({ singleton: true })
class ThemeService extends ServiceBase {
    // 事件发射器
    private readonly _onThemeChange = new Emitter<ThemeChangeEvent>();
    private readonly _onVariableChange = new Emitter<{ name: string; value: string }>();

    /** 主题变化事件 */
    readonly onThemeChange = this._onThemeChange.event;

    /** 变量变化事件 */
    readonly onVariableChange = this._onVariableChange.event;

    /** 当前主题 ID */
    private currentThemeId: string;

    /** 已注册的主题 */
    private themes: Map<string, ThemeDefinition>;

    /** 当前变量值 */
    private currentVariables: Map<string, string>;

    /**
     * 初始化主题服务
     */
    initialize(): Promise<void>;

    /**
     * 注册主题
     * @param theme 主题定义
     */
    registerTheme(theme: ThemeDefinition): IDisposable;

    /**
     * 获取主题定义
     */
    getTheme(themeId: string): ThemeDefinition | undefined;

    /**
     * 获取所有已注册主题
     */
    getThemes(): ThemeDefinition[];

    /**
     * 切换主题
     * @param themeId 主题 ID
     * @param animate 是否带动画
     */
    setTheme(themeId: string, animate?: boolean): Promise<void>;

    /**
     * 获取当前主题 ID
     */
    getCurrentTheme(): string;

    /**
     * 注册动态变量
     * @param name 变量名
     * @param value 变量值
     * @param themeId 所属主题（可选，默认为当前主题）
     */
    setVariable(name: string, value: string | number, themeId?: string): void;

    /**
     * 获取变量值
     */
    getVariable(name: string): string | undefined;

    /**
     * 批量更新变量
     */
    setVariables(variables: Record<string, string | number>, themeId?: string): void;

    /**
     * 是否是深色主题
     */
    isDarkTheme(): boolean;

    /**
     * 获取主题图标
     */
    getThemeIcon(): string | undefined;

    /**
     * 同步主题到 DOM
     */
    syncToDom(): void;

    override dispose(): void;
}
```

### 2.3 主题定义示例

```typescript
// 内置浅色主题
const lightTheme: ThemeDefinition = {
    id: 'light',
    name: '浅色',
    variables: {
        // 基础色
        'primary-color': '#007acc',
        'primary-hover': '#005a9e',
        'primary-active': '#004578',

        // 背景色
        'bg-primary': '#ffffff',
        'bg-secondary': '#f3f3f3',
        'bg-tertiary': '#e8e8e8',

        // 文本色
        'text-primary': '#333333',
        'text-secondary': '#666666',
        'text-tertiary': '#999999',

        // 边框色
        'border-primary': '#e0e0e0',
        'border-secondary': '#d0d0d0',

        // 语义色
        'success-color': '#107c10',
        'warning-color': '#797775',
        'error-color': '#a80000',
        'info-color': '#0078d4',

        // 密度
        'spacing-xs': '4px',
        'spacing-sm': '8px',
        'spacing-md': '16px',
        'spacing-lg': '24px',
        'spacing-xl': '32px',

        // 圆角
        'radius-sm': '2px',
        'radius-md': '4px',
        'radius-lg': '8px',
        'radius-full': '9999px',

        // 阴影
        'shadow-sm': '0 1px 2px rgba(0,0,0,0.05)',
        'shadow-md': '0 4px 8px rgba(0,0,0,0.1)',
        'shadow-lg': '0 8px 16px rgba(0,0,0,0.15)',
    },
    metadata: {
        dark: false,
        icon: 'sun',
    },
};

// 内置深色主题（继承浅色主题的变量，仅覆盖差异）
const darkTheme: ThemeDefinition = {
    id: 'dark',
    name: '深色',
    parent: 'light',
    variables: {
        // 覆盖背景色
        'bg-primary': '#1e1e1e',
        'bg-secondary': '#2d2d2d',
        'bg-tertiary': '#3d3d3d',

        // 覆盖文本色
        'text-primary': '#ffffff',
        'text-secondary': '#cccccc',
        'text-tertiary': '#999999',

        // 覆盖边框色
        'border-primary': '#404040',
        'border-secondary': '#505050',

        // 调整语义色（深色模式下更柔和）
        'error-color': '#f1707a',
        'warning-color': '#f1c86e',
        'success-color': '#6bc96b',

        // 阴影（深色模式更明显）
        'shadow-sm': '0 1px 2px rgba(0,0,0,0.2)',
        'shadow-md': '0 4px 8px rgba(0,0,0,0.3)',
        'shadow-lg': '0 8px 16px rgba(0,0,0,0.4)',
    },
    metadata: {
        dark: true,
        icon: 'moon',
    },
};

// 高对比度主题
const highContrastTheme: ThemeDefinition = {
    id: 'high-contrast',
    name: '高对比度',
    parent: 'light',
    variables: {
        'bg-primary': '#000000',
        'bg-secondary': '#1a1a1a',
        'text-primary': '#ffffff',
        'text-secondary': '#ffffff',
        'border-primary': '#ffffff',
        'primary-color': '#ffff00',
        'primary-hover': '#ffff99',
    },
    metadata: {
        dark: true,
        icon: 'contrast',
    },
};
```

### 2.4 使用示例

```typescript
// 初始化主题服务
await themeService.initialize();

// 获取系统偏好
const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
const savedTheme = localStorage.getItem('theme') || (prefersDark ? 'dark' : 'light');

// 设置初始主题
await themeService.setTheme(savedTheme);

// 切换主题
await themeService.setTheme('dark', true); // 带动画

// 监听主题变化
themeService.onThemeChange((event) => {
    console.log(`Theme changed from ${event.previousTheme} to ${event.newTheme}`);
    console.log(`Changed variables: ${event.changedVariables.join(', ')}`);
});

// 注册自定义变量
themeService.setVariable('custom-brand-color', '#ff6600');

// 获取变量值
const primaryColor = themeService.getVariable('primary-color');

// 在 React 组件中使用
function ThemedComponent() {
    const [variables, setVariables] = useState({
        primary: themeService.getVariable('primary-color'),
        bg: themeService.getVariable('bg-primary'),
    });

    useEffect(() => {
        const unsub = themeService.onVariableChange(({ name }) => {
            if (name === 'primary-color' || name === 'bg-primary') {
                setVariables({
                    primary: themeService.getVariable('primary-color'),
                    bg: themeService.getVariable('bg-primary'),
                });
            }
        });
        return unsub;
    }, []);

    return (
        <div style={{
            backgroundColor: `var(--bg-primary)`,
            color: `var(--text-primary)`,
        }}>
            <button style={{
                backgroundColor: `var(--primary-color)`,
                color: 'white',
            }}>
                Click me
            </button>
        </div>
    );
}
```

### 2.5 设计决策

| 决策点 | 选择 | 理由 |
|--------|------|------|
| 变量存储 | CSS Custom Properties | 原生支持，性能好，可被 CSS 直接使用 |
| 主题继承 | parent 字段 | 减少重复定义，仅覆盖差异变量 |
| 动画支持 | CSS transition | 利用浏览器合成器，性能好 |
| 持久化 | LocalStorage | 简单可靠，刷新后保持 |
| 系统同步 | prefers-color-scheme | 自动跟随系统主题 |

### 2.6 主题切换动画

```css
/* 定义动画类 */
.theme-transition {
    transition:
        background-color 0.2s ease,
        color 0.2s ease,
        border-color 0.2s ease,
        box-shadow 0.2s ease;
}

/* 应用到根元素 */
html.theme-changing * {
    transition:
        background-color 0.2s ease,
        color 0.2s ease,
        border-color 0.2s ease,
        box-shadow 0.2s ease;
}
```

```typescript
async setTheme(themeId: string, animate = false): Promise<void> {
    const previousTheme = this.currentThemeId;

    if (animate) {
        // 添加动画类
        document.documentElement.classList.add('theme-changing');

        // 等待动画完成
        await new Promise(resolve => setTimeout(resolve, 200));
    }

    // 更新主题
    this.currentThemeId = themeId;
    this.syncToDom();

    // 移除动画类
    if (animate) {
        setTimeout(() => {
            document.documentElement.classList.remove('theme-changing');
        }, 200);
    }

    // 保存到 LocalStorage
    localStorage.setItem('theme', themeId);

    // 触发事件
    this._onThemeChange.fire({
        previousTheme,
        newTheme: themeId,
        changedVariables: this.getChangedVariableNames(previousTheme, themeId),
    });
}
```

### 2.7 与系统主题同步

```typescript
initialize(): Promise<void> {
    // 从 LocalStorage 加载保存的主题
    const savedTheme = localStorage.getItem('theme');

    if (savedTheme && this.themes.has(savedTheme)) {
        this.currentThemeId = savedTheme;
    } else {
        // 没有保存的主题，使用系统偏好
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        this.currentThemeId = prefersDark ? 'dark' : 'light';
    }

    this.syncToDom();

    // 监听系统主题变化
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => {
        const autoTheme = e.matches ? 'dark' : 'light';
        // 仅当用户没有手动设置主题时才跟随系统
        if (!localStorage.getItem('theme')) {
            this.setTheme(autoTheme, true);
        }
    };

    mediaQuery.addEventListener('change', handler);
    this._store.add({ dispose: () => mediaQuery.removeEventListener('change', handler) });
}
```

---

## 3. 焦点管理服务 (FocusService)

### 3.1 职责

- 统一管理应用焦点状态
- 支持焦点历史（前进/后退）
- 支持焦点恢复
- 支持焦点陷阱（模态对话框）
- 支持声明式焦点管理

### 3.2 核心接口

```typescript
/**
 * 焦点区域类型
 */
type FocusZoneType = 'editor' | 'panel' | 'input' | 'button' | 'list' | 'custom';

/**
 * 焦点状态
 */
interface FocusState {
    /** 当前焦点元素 */
    activeElement: HTMLElement | null;

    /** 焦点区域 ID */
    zoneId: string | null;

    /** 焦点区域类型 */
    zoneType: FocusZoneType | null;

    /** 附加数据 */
    data?: Record<string, unknown>;
}

/**
 * 焦点区域配置
 */
interface FocusZoneConfig {
    /** 区域唯一标识 */
    id: string;

    /** 区域类型 */
    type: FocusZoneType;

    /** 区域根元素 */
    element: HTMLElement;

    /** 获取区域内可聚焦元素 */
    getFocusableElements?: () => HTMLElement[];

    /** 进入区域时的默认焦点 */
    defaultFocus?: string | (() => HTMLElement);

    /** 进入回调 */
    onEnter?: (state: FocusState) => void;

    /** 离开回调 */
    onLeave?: (state: FocusState) => void;
}

/**
 * 焦点历史项
 */
interface FocusHistoryItem {
    /** 焦点状态 */
    state: FocusState;

    /** 时间戳 */
    timestamp: number;
}

/**
 * 焦点服务
 */
@Service({ singleton: true })
class FocusService extends ServiceBase {
    // 事件发射器
    private readonly _onFocusChange = new Emitter<FocusState>();
    private readonly _onZoneEnter = new Emitter<string>();
    private readonly _onZoneLeave = new Emitter<string>();

    /** 焦点变化事件 */
    readonly onFocusChange = this._onFocusChange.event;

    /** 区域进入事件 */
    readonly onZoneEnter = this._onZoneEnter.event;

    /** 区域离开事件 */
    readonly onZoneLeave = this._onZoneLeave.event;

    /** 当前焦点状态 */
    readonly currentFocus: FocusState;

    /** 焦点历史大小限制 */
    readonly historyLimit = 50;

    /**
     * 注册焦点区域
     * @param config 配置
     * @returns IDisposable
     */
    registerZone(config: FocusZoneConfig): IDisposable;

    /**
     * 聚焦到元素
     * @param element 元素
     * @param options 选项
     */
    focus(element: HTMLElement, options?: {
        zoneId?: string;
        data?: Record<string, unknown>;
        saveHistory?: boolean;
    }): void;

    /**
     * 聚焦到区域
     * @param zoneId 区域 ID
     * @param options 选项
     */
    focusZone(zoneId: string, options?: {
        data?: Record<string, unknown>;
        saveHistory?: boolean;
    }): void;

    /**
     * 保存当前焦点状态
     */
    saveFocusState(): FocusState;

    /**
     * 恢复焦点状态
     * @param state 状态
     */
    restoreFocusState(state: FocusState): void;

    /**
     * 推入焦点历史
     */
    pushHistory(state: FocusState): void;

    /**
     * 弹出焦点历史（返回上一个焦点）
     */
    popHistory(): FocusState | null;

    /**
     * 清空焦点历史
     */
    clearHistory(): void;

    /**
     * 获取焦点区域内的下一个/上一个元素
     * @param zoneId 区域 ID
     * @param current 当前元素
     * @param direction 方向
     */
    getFocusableInZone(zoneId: string, current: HTMLElement, direction: 'next' | 'prev'): HTMLElement | null;

    /**
     * 创建焦点陷阱
     * @param element 陷阱区域
     * @returns IDisposable
     */
    createFocusTrap(element: HTMLElement): IDisposable;

    override dispose(): void;
}
```

### 3.3 使用示例

```typescript
// 注册编辑器焦点区域
focusService.registerZone({
    id: 'editor-main',
    type: 'editor',
    element: editorElement,
    getFocusableElements: () => {
        return Array.from(editorElement.querySelectorAll('[contenteditable="true"]'));
    },
    defaultFocus: () => {
        return editorElement.querySelector('[contenteditable="true"]') as HTMLElement;
    },
    onEnter: (state) => {
        console.log('Entered editor focus zone');
    },
});

// 注册面板焦点区域
focusService.registerZone({
    id: 'file-tree',
    type: 'list',
    element: fileTreeElement,
    getFocusableElements: () => {
        return Array.from(fileTreeElement.querySelectorAll('.file-node[tabindex="0"]'));
    },
});

// 手动聚焦
const input = document.querySelector('#search-input') as HTMLInputElement;
focusService.focus(input, {
    zoneId: 'search-panel',
    data: { source: 'keyboard-shortcut' },
});

// 聚焦到区域
focusService.focusZone('editor-main');

// 保存和恢复焦点（用于对话框关闭后）
const previousFocus = focusService.saveFocusState();
dialogService.open({ ... });
// 对话框关闭后
focusService.restoreFocusState(previousFocus);

// 焦点历史导航
// 用户从文件树聚焦到编辑器，焦点历史：[file-tree, editor]
// 按下 Alt+Left，返回文件树
focusService.popHistory();

// 创建焦点陷阱（用于模态对话框）
const dialog = document.querySelector('.dialog');
const trap = focusService.createFocusTrap(dialog);
// 对话框关闭时
trap.dispose();
```

### 3.4 焦点陷阱实现

```typescript
createFocusTrap(element: HTMLElement): IDisposable {
    const previouslyFocused = document.activeElement as HTMLElement;
    const focusableElements = this.getFocusableElements(element);
    const firstFocusable = focusableElements[0];
    const lastFocusable = focusableElements[focusableElements.length - 1];

    // 聚焦到第一个可聚焦元素
    firstFocusable?.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key !== 'Tab') return;

        const currentFocused = document.activeElement as HTMLElement;

        // Shift+Tab
        if (e.shiftKey) {
            if (currentFocused === firstFocusable || !element.contains(currentFocused)) {
                e.preventDefault();
                lastFocusable?.focus();
            }
        }
        // Tab
        else {
            if (currentFocused === lastFocusable || !element.contains(currentFocused)) {
                e.preventDefault();
                firstFocusable?.focus();
            }
        }
    };

    // 阻止点击外部元素
    const handleMouseDown = (e: MouseEvent) => {
        if (!element.contains(e.target as HTMLElement)) {
            e.preventDefault();
        }
    };

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handleMouseDown);

    return {
        dispose: () => {
            document.removeEventListener('keydown', handleKeyDown);
            document.removeEventListener('mousedown', handleMouseDown);
            // 恢复之前的焦点
            previouslyFocused?.focus();
        },
    };
}

getFocusableElements(container: HTMLElement): HTMLElement[] {
    const focusableSelectors = [
        'button:not([disabled])',
        'input:not([disabled])',
        'select:not([disabled])',
        'textarea:not([disabled])',
        'a[href]',
        '[tabindex]:not([tabindex="-1"])',
        '[contenteditable="true"]',
    ].join(', ');

    return Array.from(container.querySelectorAll(focusableSelectors))
        .filter(el => {
            const style = window.getComputedStyle(el);
            return style.display !== 'none' && style.visibility !== 'hidden';
        });
}
```

### 3.5 与快捷键服务集成

```typescript
// 注册全局焦点切换快捷键
shortcutService.register({
    id: 'focus.editor',
    shortcut: 'Ctrl+Shift+E',
    target: 'global',
    handler: () => {
        focusService.focusZone('editor-main');
    },
});

shortcutService.register({
    id: 'focus.fileTree',
    shortcut: 'Ctrl+Shift+F',
    target: 'global',
    handler: () => {
        focusService.focusZone('file-tree');
    },
});

shortcutService.register({
    id: 'focus.previous',
    shortcut: 'Alt+Left',
    target: 'global',
    handler: () => {
        const previous = focusService.popHistory();
        if (previous?.zoneId) {
            focusService.focusZone(previous.zoneId);
        }
    },
});

shortcutService.register({
    id: 'focus.next',
    shortcut: 'Alt+Right',
    target: 'global',
    handler: () => {
        // 前进（如果有焦点历史栈）
        // 需要额外的 forward history 支持
    },
});
```

### 3.6 设计决策

| 决策点 | 选择 | 理由 |
|--------|------|------|
| 焦点区域 | 声明式注册 | 模块自己管理焦点行为 |
| 焦点历史 | 栈结构 | 符合用户心智模型（后退） |
| 焦点陷阱 | 编程式创建 | 灵活控制生命周期 |
| 自动聚焦 | 不自动聚焦 | 避免打扰用户，显式调用 |
| 无障碍 | WAI-ARIA 集成 | 支持屏幕阅读器 |

---

## 4. 布局服务 (LayoutService)

### 4.1 职责

- 统一管理应用布局状态（面板折叠/展开、宽度、位置）
- 支持布局持久化
- 支持拖拽调整大小
- 支持响应式布局
- 支持布局预设

### 4.2 核心接口

```typescript
/**
 * 面板位置
 */
type PanelPosition = 'left' | 'right' | 'bottom';

/**
 * 面板状态
 */
interface PanelState {
    /** 面板 ID */
    id: string;

    /** 是否可见 */
    visible: boolean;

    /** 是否折叠（仅显示图标） */
    collapsed: boolean;

    /** 面板尺寸（宽度或高度） */
    size: number;

    /** 最小尺寸 */
    minSize: number;

    /** 最大尺寸 */
    maxSize: number;

    /** 位置 */
    position: PanelPosition;
}

/**
 * 布局状态
 */
interface LayoutState {
    /** 主内容区域尺寸 */
    mainSize: { width: number; height: number };

    /** 面板状态映射 */
    panels: Map<string, PanelState>;

    /** 当前布局预设 ID */
    presetId: string;
}

/**
 * 布局预设
 */
interface LayoutPreset {
    id: string;
    name: string;
    panels: Record<string, Partial<PanelState>>;
}

/**
 * 布局服务
 */
@Service({ singleton: true })
class LayoutService extends ServiceBase {
    // 事件发射器
    private readonly _onLayoutChange = new Emitter<LayoutState>();
    private readonly _onPanelChange = new Emitter<{ panelId: string; state: PanelState }>();

    /** 布局变化事件 */
    readonly onLayoutChange = this._onLayoutChange.event;

    /** 面板变化事件 */
    readonly onPanelChange = this._onPanelChange.event;

    /** 当前布局状态 */
    readonly layout: LayoutState;

    /**
     * 初始化布局服务
     */
    initialize(): Promise<void>;

    /**
     * 注册面板
     * @param config 面板配置
     */
    registerPanel(config: {
        id: string;
        position: PanelPosition;
        defaultSize: number;
        minSize?: number;
        maxSize?: number;
        collapsedByDefault?: boolean;
    }): IDisposable;

    /**
     * 获取面板状态
     */
    getPanelState(panelId: string): PanelState | undefined;

    /**
     * 设置面板可见性
     */
    setPanelVisible(panelId: string, visible: boolean): void;

    /**
     * 切换面板可见性
     */
    togglePanel(panelId: string): void;

    /**
     * 设置面板折叠状态
     */
    setPanelCollapsed(panelId: string, collapsed: boolean): void;

    /**
     * 设置面板尺寸
     */
    setPanelSize(panelId: string, size: number): void;

    /**
     * 获取所有面板
     */
    getPanels(): PanelState[];

    /**
     * 获取指定位置的面板
     */
    getPanelsAt(position: PanelPosition): PanelState[];

    /**
     * 注册布局预设
     */
    registerPreset(preset: LayoutPreset): IDisposable;

    /**
     * 应用布局预设
     */
    applyPreset(presetId: string): void;

    /**
     * 获取已注册预设
     */
    getPresets(): LayoutPreset[];

    /**
     * 重置布局
     */
    resetLayout(): void;

    override dispose(): void;
}
```

### 4.3 使用示例

```typescript
// 初始化布局服务
await layoutService.initialize();

// 注册面板
layoutService.registerPanel({
    id: 'file-tree',
    position: 'left',
    defaultSize: 250,
    minSize: 150,
    maxSize: 500,
});

layoutService.registerPanel({
    id: 'ai-panel',
    position: 'right',
    defaultSize: 300,
    minSize: 200,
    maxSize: 600,
});

layoutService.registerPanel({
    id: 'terminal',
    position: 'bottom',
    defaultSize: 150,
    minSize: 100,
    maxSize: 400,
    collapsedByDefault: true,
});

// 切换面板可见性（快捷键命令）
shortcutService.register({
    id: 'view.toggleSidebar',
    shortcut: 'Ctrl+B',
    handler: () => {
        layoutService.togglePanel('file-tree');
    },
});

shortcutService.register({
    id: 'view.toggleAI',
    shortcut: 'Ctrl+Shift+A',
    handler: () => {
        layoutService.togglePanel('ai-panel');
    },
});

// 监听布局变化（用于持久化）
layoutService.onPanelChange(({ panelId, state }) => {
    const layouts = JSON.parse(localStorage.getItem('layouts') || '{}');
    layouts[panelId] = state;
    localStorage.setItem('layouts', JSON.stringify(layouts));
});

// 注册预设
layoutService.registerPreset({
    id: 'coding',
    name: '编码模式',
    panels: {
        'file-tree': { visible: true, collapsed: false },
        'ai-panel': { visible: false },
        'terminal': { visible: false },
    },
});

layoutService.registerPreset({
    id: 'writing',
    name: '写作模式',
    panels: {
        'file-tree': { visible: false },
        'ai-panel': { visible: true, collapsed: true },
        'terminal': { visible: false },
    },
});

// 应用预设
layoutService.applyPreset('coding');
```

### 4.4 与拖拽服务集成（调整大小）

```typescript
// 使用 DragDropService 实现面板拖拽调整大小
function registerPanelResize(panelId: string, resizeHandle: HTMLElement) {
    let startX = 0;
    let startSize = 0;

    dragDropService.registerDragSource(resizeHandle, {
        type: 'panel-resize',
        getDragData: (event) => {
            const panel = layoutService.getPanelState(panelId);
            startX = event.clientX;
            startSize = panel?.size || 0;

            return {
                type: 'panel-resize',
                data: { panelId, startX, startSize },
                effect: 'move',
            };
        },
    });

    dragDropService.registerDropTarget(document.body, {
        acceptedTypes: ['panel-resize'],
        onDragOver: (event) => {
            event.preventDefault();
            document.body.classList.add('resizing');
        },
        onDrop: (event, data) => {
            document.body.classList.remove('resizing');

            const deltaX = event.clientX - data.startX;
            const newSize = data.startSize + deltaX;

            layoutService.setPanelSize(data.panelId, newSize);
        },
    });
}
```

### 4.5 设计决策

| 决策点 | 选择 | 理由 |
|--------|------|------|
| 状态存储 | 内存 + LocalStorage | 快速访问，刷新持久化 |
| 调整大小 | 拖拽 + 增量更新 | 流畅体验 |
| 响应式 | CSS Grid + Flexbox | 现代布局方案 |
| 预设支持 | 命名预设 | 快速切换场景布局 |
| 面板注册 | 编程式 | 模块自己定义面板属性 |

---

## 5. 数据流

### 5.1 主题切换数据流

```
用户点击主题切换按钮
    │
    ▼
ThemeService.setTheme('dark', true)
    │
    ├──► 更新 currentThemeId
    │
    ├──► syncToDom() → 更新 CSS 变量
    │
    ├──► 触发 onThemeChange 事件
    │
    ├──► 保存到 LocalStorage
    │
    ▼
UI 组件监听变量变化
    │
    ▼
React 重新渲染（自动）
```

### 5.2 焦点管理数据流

```
用户按下 Ctrl+Shift+E
    │
    ▼
ShortcutService 捕获
    │
    ▼
FocusService.focusZone('editor-main')
    │
    ├──► 保存当前焦点到历史
    │
    ├──► 获取 defaultFocus 元素
    │
    ├──► element.focus()
    │
    ├──► 触发 onZoneEnter 事件
    │
    ▼
编辑器获得焦点，显示光标
```

### 5.3 布局调整数据流

```
用户拖拽调整大小手柄
    │
    ▼
DragDropService 处理拖拽
    │
    ▼
onDrop: 计算新尺寸
    │
    ▼
LayoutService.setPanelSize(panelId, newSize)
    │
    ├──► 更新内部状态
    │
    ├──► 触发 onPanelChange 事件
    │
    ├──► 保存到 LocalStorage
    │
    ▼
React 组件重新渲染
    │
    ▼
CSS Grid 重新布局
```

---

## 6. 错误处理

### 6.1 主题服务

| 错误场景 | 处理方式 |
|----------|----------|
| 主题 ID 不存在 | 警告日志，使用默认主题 |
| CSS 变量不支持 | 降级到内联样式 |
| LocalStorage 不可用 | 不持久化，内存运行 |
| 动画导致性能问题 | 自动禁用动画 |

### 6.2 焦点服务

| 错误场景 | 处理方式 |
|----------|----------|
| 聚焦元素不存在 | 跳过，不抛错 |
| 焦点区域未注册 | 警告日志 |
| 焦点陷阱内元素无法聚焦 | 找到最接近的可聚焦元素 |
| 历史记录溢出 | 移除最早的历史项 |

### 6.3 布局服务

| 错误场景 | 处理方式 |
|----------|----------|
| 面板 ID 不存在 | 警告日志，忽略操作 |
| 尺寸超出范围 | 裁剪到 minSize/maxSize |
| LocalStorage 不可用 | 不持久化 |
| 拖拽调整失败 | 回滚到之前尺寸 |

---

## 7. 测试策略

### 7.1 单元测试

```typescript
// ThemeService 测试
describe('ThemeService', () => {
    it('应注册主题', () => {
        service.registerTheme({
            id: 'test',
            name: 'Test',
            variables: { 'primary-color': '#ff0000' },
        });
        expect(service.getTheme('test')).toBeDefined();
    });

    it'应切换主题', async () => {
        await service.setTheme('dark');
        expect(service.getCurrentTheme()).toBe('dark');
    });

    it'应触发主题变化事件', () => {
        const mock = vi.fn();
        service.onThemeChange(mock);
        service.setTheme('dark');
        expect(mock).toHaveBeenCalled();
    });

    it'应同步变量到 DOM', () => {
        service.setVariable('test-var', 'red');
        service.syncToDom();
        expect(getComputedStyle(document.documentElement).getPropertyValue('--test-var')).toBe('red');
    });
});

// FocusService 测试
describe('FocusService', () => {
    it'应注册焦点区域', () => {
        const element = document.createElement('div');
        service.registerZone({
            id: 'test',
            type: 'editor',
            element,
        });
        expect(service.getZone('test')).toBeDefined();
    });

    it'应聚焦到元素', () => {
        const element = document.createElement('input');
        document.body.appendChild(element);
        service.focus(element);
        expect(document.activeElement).toBe(element);
    });

    it'应保存和恢复焦点', () => {
        const element1 = document.createElement('input');
        const element2 = document.createElement('input');
        document.body.append(element1, element2);

        service.focus(element1);
        const state = service.saveFocusState();
        service.focus(element2);
        service.restoreFocusState(state);

        expect(document.activeElement).toBe(element1);
    });

    it'应支持焦点历史', () => {
        const element1 = document.createElement('input');
        const element2 = document.createElement('input');
        document.body.append(element1, element2);

        service.focus(element1, { saveHistory: true });
        service.focus(element2, { saveHistory: true });

        const previous = service.popHistory();
        expect(previous?.data?.zoneId).toBe('element1');
    });
});

// LayoutService 测试
describe('LayoutService', () => {
    it'应注册面板', () => {
        service.registerPanel({
            id: 'test',
            position: 'left',
            defaultSize: 200,
        });
        expect(service.getPanelState('test')).toBeDefined();
    });

    it'应切换面板可见性', () => {
        service.registerPanel({ id: 'test', position: 'left', defaultSize: 200 });
        expect(service.getPanelState('test')?.visible).toBe(true);
        service.togglePanel('test');
        expect(service.getPanelState('test')?.visible).toBe(false);
    });

    it'应限制面板尺寸在范围内', () => {
        service.registerPanel({
            id: 'test',
            position: 'left',
            defaultSize: 200,
            minSize: 100,
            maxSize: 300,
        });
        service.setPanelSize('test', 50); // 小于 minSize
        expect(service.getPanelState('test')?.size).toBe(100);
        service.setPanelSize('test', 400); // 大于 maxSize
        expect(service.getPanelState('test')?.size).toBe(300);
    });
});
```

---

## 8. 实施顺序

1. **ThemeService** - 独立实现，影响面广
2. **FocusService** - 独立实现，依赖较少
3. **LayoutService** - 依赖 DragDropService（调整大小）

---

## 9. 待决策事项

| 事项 | 状态 | 建议 |
|------|------|------|
| 主题切换动画时长 | 待确认 | 建议 200ms |
| 焦点历史大小 | 待确认 | 建议 50 项 |
| 布局持久化键名 | 待确认 | 建议 `mykm-layout` |
| 预设数量限制 | 待确认 | 第一批无限制 |

---

## 10. 与现有服务集成

### 依赖关系

```
ThemeService ─┬──► NotificationService（错误提示）
              └──► 无其他依赖

FocusService ─┬──► ShortcutService（快捷键触发）
              └──► 无其他依赖

LayoutService ─┬──► DragDropService（调整大小）
               ├──► ShortcutService（快捷键）
               └──► ThemeService（主题变量）
```

---

## 11. 总结

本批次三个服务是工作区体验的核心：

| 服务 | 价值 | 复杂度 |
|------|------|--------|
| ThemeService | 视觉一致性，用户偏好 | 中 |
| FocusService | 键盘导航，无障碍 | 中 |
| LayoutService | 个性化布局，效率 | 高 |

建议实施顺序：ThemeService → FocusService → LayoutService
