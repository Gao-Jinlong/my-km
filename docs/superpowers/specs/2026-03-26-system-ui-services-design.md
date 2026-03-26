# 系统 UI 服务设计文档

**创建日期**: 2026-03-26
**状态**: 待实现
**批次**: 第二批（系统 UI 层）

---

## 1. 概述

本文档描述项目系统 UI 层两个基础服务的设计：
- 通知服务 (NotificationService)
- 对话框服务 (DialogService)

这两个服务提供统一的用户交互界面，是应用体验一致性的关键。

---

## 2. 架构位置

```
┌─────────────────────────────────────────────────────────┐
│                    UI 层 (React/Zustand)                 │
│  NotificationToast  │  DialogModal  │  ContextMenu      │
├─────────────────────────────────────────────────────────┤
│                    服务层 (Services)                     │
│  ┌─────────────────────┐  ┌─────────────────────────┐   │
│  │ NotificationService │  │   DialogService         │   │
│  └─────────────────────┘  └─────────────────────────┘   │
├─────────────────────────────────────────────────────────┤
│                  平台层 (Platform)                       │
│  DI 容器 │ 事件总线 │ ThemeService │ FocusService       │
└─────────────────────────────────────────────────────────┘
```

---

## 3. 通知服务 (NotificationService)

### 3.1 职责

- 统一管理系统通知的显示、更新、消失
- 支持多种通知类型（info、success、warning、error）
- 支持通知分组和堆叠
- 支持操作按钮和回调
- 支持通知持久化（重要通知刷新后仍存在）

### 3.2 核心接口

```typescript
/**
 * 通知类型
 */
type NotificationType = 'info' | 'success' | 'warning' | 'error';

/**
 * 通知配置
 */
interface NotificationConfig {
    /** 通知唯一标识（可选，用于更新/删除） */
    id?: string;

    /** 通知类型 */
    type: NotificationType;

    /** 通知标题 */
    title: string;

    /** 通知消息内容（支持 ReactNode） */
    message?: ReactNode;

    /** 自动消失时间（毫秒），0 表示不自动消失 */
    duration?: number;

    /** 操作按钮配置 */
    actions?: Array<{
        label: string;
        onClick: () => void | Promise<void>;
        variant?: 'primary' | 'secondary' | 'danger';
    }>;

    /** 点击通知的回调 */
    onClick?: () => void;

    /** 关闭通知的回调 */
    onClose?: () => void;

    /** 是否持久化（刷新后仍存在） */
    persistent?: boolean;

    /** 通知分组（相同分组的通知会堆叠） */
    group?: string;
}

/**
 * 通知实例
 */
interface Notification extends NotificationConfig {
    /** 生成的唯一 ID */
    id: string;

    /** 创建时间 */
    createdAt: number;

    /** 是否正在消失动画中 */
    isDismissing?: boolean;
}

/**
 * 通知服务
 */
@Service({ singleton: true })
class NotificationService extends ServiceBase {
    // 事件发射器
    private readonly _onNotificationAdded = new Emitter<Notification>();
    private readonly _onNotificationUpdated = new Emitter<Notification>();
    private readonly _onNotificationRemoved = new Emitter<string>();

    /** 通知已添加事件 */
    readonly onNotificationAdded = this._onNotificationAdded.event;

    /** 通知已更新事件 */
    readonly onNotificationUpdated = this._onNotificationUpdated.event;

    /** 通知已移除事件 */
    readonly onNotificationRemoved = this._onNotificationRemoved.event;

    /**
     * 显示信息通知
     */
    info(title: string, message?: string, config?: Partial<NotificationConfig>): string;

    /**
     * 显示成功通知
     */
    success(title: string, message?: string, config?: Partial<NotificationConfig>): string;

    /**
     * 显示警告通知
     */
    warning(title: string, message?: string, config?: Partial<NotificationConfig>): string;

    /**
     * 显示错误通知
     */
    error(title: string, message?: string, config?: Partial<NotificationConfig>): string;

    /**
     * 显示通知（完整配置）
     * @param config 通知配置
     * @returns 通知 ID，用于后续更新/关闭
     */
    show(config: NotificationConfig): string;

    /**
     * 更新通知
     * @param id 通知 ID
     * @param config 更新的配置
     */
    update(id: string, config: Partial<NotificationConfig>): void;

    /**
     * 关闭通知
     * @param id 通知 ID，传 '*' 关闭所有
     */
    close(id: string): void;

    /**
     * 关闭指定分组的所有通知
     */
    closeGroup(group: string): void;

    /**
     * 获取所有通知
     */
    getNotifications(): Notification[];

    /**
     * 获取持久化通知（从 LocalStorage 加载）
     */
    loadPersistentNotifications(): Notification[];

    override dispose(): void;
}
```

### 3.3 使用示例

```typescript
// 简单通知
notificationService.info('保存中...', '正在保存文档');
notificationService.success('保存成功', '文档已保存到本地');

// 带操作的通知
notificationService.error('保存失败', '网络错误', {
    duration: 0, // 不自动消失
    actions: [
        { label: '重试', onClick: () => retrySave(), variant: 'primary' },
        { label: '取消', onClick: () => {}, variant: 'secondary' },
    ],
});

// 可更新的通知（用于异步操作）
const notifyId = notificationService.info('处理中...', '正在上传文件');
try {
    await uploadFile(file);
    notificationService.update(notifyId, {
        type: 'success',
        title: '上传成功',
        message: '文件已上传到服务器',
    });
    setTimeout(() => notificationService.close(notifyId), 3000);
} catch (err) {
    notificationService.update(notifyId, {
        type: 'error',
        title: '上传失败',
        actions: [{ label: '重试', onClick: () => retryUpload() }],
    });
}

// 分组通知（防止刷屏）
notificationService.show({
    type: 'info',
    title: '同步中',
    group: 'sync', // 相同 group 会替换旧通知
});
```

### 3.4 设计决策

| 决策点 | 选择 | 理由 |
|--------|------|------|
| 通知位置 | 右上角堆叠 | 符合用户习惯，不阻塞操作 |
| 自动消失 | 默认 4500ms | 足够阅读，不打断流程 |
| 持久化 | LocalStorage | 刷新后仍可见，重要通知不丢失 |
| 分组机制 | group 字段 | 防止相同来源通知刷屏 |
| 类型系统 | 4 种固定类型 | 简化使用，保持视觉一致 |

### 3.5 UI 组件设计

```typescript
// NotificationContainer.tsx - 通知容器组件
function NotificationContainer() {
    const [notifications, setNotifications] = useState<Notification[]>([]);

    useEffect(() => {
        // 订阅通知事件
        const unsubAdd = notificationService.onNotificationAdded(add);
        const unsubUpdate = notificationService.onNotificationUpdated(update);
        const unsubRemove = notificationService.onNotificationRemoved(remove);
        return () => { unsubAdd(); unsubUpdate(); unsubRemove(); };
    }, []);

    return (
        <div className="notification-container">
            {notifications.map(n => (
                <NotificationToast key={n.id} notification={n} />
            ))}
        </div>
    );
}

// NotificationToast.tsx - 单个通知组件
function NotificationToast({ notification }) {
    const { type, title, message, actions, isDismissing } = notification;

    return (
        <div className={`notification-toast toast-${type} ${isDismissing ? 'dismissing' : ''}`}>
            <div className="notification-icon">{getIcon(type)}</div>
            <div className="notification-content">
                <div className="notification-title">{title}</div>
                {message && <div className="notification-message">{message}</div>}
            </div>
            {actions && (
                <div className="notification-actions">
                    {actions.map(action => (
                        <button onClick={action.onClick} className={`btn-${action.variant}`}>
                            {action.label}
                        </button>
                    ))}
                </div>
            )}
            <button className="notification-close" onClick={() => notificationService.close(notification.id)}>×</button>
        </div>
    );
}
```

### 3.6 错误处理

| 错误场景 | 处理方式 |
|----------|----------|
| 通知 ID 不存在时更新 | 警告日志，忽略操作 |
| 通知 ID 不存在时关闭 | 无操作，不抛错 |
| 动作回调执行失败 | 捕获错误，显示错误通知 |
| LocalStorage 不可用 | 降级为非持久化，警告日志 |

---

## 4. 对话框服务 (DialogService)

### 4.1 职责

- 统一管理系统对话框的显示和关闭
- 提供标准对话框（alert、confirm、prompt）
- 支持自定义组件对话框
- 支持对话框队列（防止多个对话框同时显示）
- 支持 ESC 关闭和点击遮罩关闭配置

### 4.2 核心接口

```typescript
/**
 * 标准对话框类型
 */
type DialogType = 'alert' | 'confirm' | 'prompt' | 'custom';

/**
 * 对话框配置基础接口
 */
interface BaseDialogConfig {
    /** 对话框唯一标识（可选） */
    id?: string;

    /** 对话框标题 */
    title: string;

    /** 是否显示关闭按钮 */
    closable?: boolean;

    /** 点击遮罩是否关闭 */
    maskClosable?: boolean;

    /** 是否支持 ESC 关闭 */
    escClosable?: boolean;

    /** 对话框宽度 */
    width?: number | string;

    /** 自定义类名 */
    className?: string;

    /** 关闭回调 */
    onClose?: () => void;
}

/**
 * Alert 对话框配置
 */
interface AlertDialogConfig extends BaseDialogConfig {
    type: 'alert';
    message: ReactNode;
    confirmText?: string;
    onConfirm?: () => void | Promise<void>;
}

/**
 * Confirm 对话框配置
 */
interface ConfirmDialogConfig extends BaseDialogConfig {
    type: 'confirm';
    message: ReactNode;
    confirmText?: string;
    cancelText?: string;
    confirmVariant?: 'primary' | 'danger';
    onConfirm?: () => void | Promise<void>;
    onCancel?: () => void;
}

/**
 * Prompt 对话框配置
 */
interface PromptDialogConfig extends BaseDialogConfig {
    type: 'prompt';
    message: ReactNode;
    defaultValue?: string;
    placeholder?: string;
    validate?: (value: string) => boolean | string;
    confirmText?: string;
    cancelText?: string;
    onConfirm?: (value: string) => void | Promise<void>;
    onCancel?: () => void;
}

/**
 * 自定义对话框配置
 */
interface CustomDialogConfig extends BaseDialogConfig {
    type: 'custom';
    /** 自定义内容组件 */
    content: ReactNode;
    /** 自定义底部操作区 */
    footer?: ReactNode | false;
}

type DialogConfig = AlertDialogConfig | ConfirmDialogConfig | PromptDialogConfig | CustomDialogConfig;

/**
 * 对话框实例
 */
interface DialogInstance {
    id: string;
    config: DialogConfig;
    isOpen: boolean;
    close: () => void;
}

/**
 * 对话框服务
 */
@Service({ singleton: true })
class DialogService extends ServiceBase {
    // 事件发射器
    private readonly _onDialogOpened = new Emitter<DialogInstance>();
    private readonly _onDialogClosed = new Emitter<string>();

    /** 对话框已打开事件 */
    readonly onDialogOpened = this._onDialogOpened.event;

    /** 对话框已关闭事件 */
    readonly onDialogClosed = this._onDialogClosed.event;

    /**
     * 显示 Alert 对话框
     * @returns Promise，用户确认后 resolve
     */
    alert(config: AlertDialogConfig | string): Promise<void>;

    /**
     * 显示 Confirm 对话框
     * @returns Promise<boolean>，用户确认返回 true，取消返回 false
     */
    confirm(config: ConfirmDialogConfig | string): Promise<boolean>;

    /**
     * 显示 Prompt 对话框
     * @returns Promise<string | null>，用户输入的值，取消返回 null
     */
    prompt(config: PromptDialogConfig): Promise<string | null>;

    /**
     * 显示自定义对话框
     * @returns DialogInstance，包含 close 方法
     */
    open(config: CustomDialogConfig): DialogInstance;

    /**
     * 关闭对话框
     * @param id 对话框 ID，传 '*' 关闭所有
     */
    close(id: string): void;

    /**
     * 获取所有打开的对话框
     */
    getOpenDialogs(): DialogInstance[];

    override dispose(): void;
}
```

### 4.3 使用示例

```typescript
// Alert 对话框
await dialogService.alert({
    type: 'alert',
    title: '提示',
    message: '操作已完成',
});

// 简洁用法（仅消息）
await dialogService.alert('保存成功');

// Confirm 对话框
const confirmed = await dialogService.confirm({
    type: 'confirm',
    title: '确认删除',
    message: '确定要删除这个文件吗？此操作不可恢复。',
    confirmVariant: 'danger',
    confirmText: '删除',
    cancelText: '取消',
});

if (confirmed) {
    await deleteFile(path);
}

// Prompt 对话框
const name = await dialogService.prompt({
    type: 'prompt',
    title: '新建文件',
    message: '请输入文件名',
    placeholder: 'untitled.md',
    validate: (value) => {
        if (!value.trim()) return '文件名不能为空';
        if (/[/\\:*?"<>|]/.test(value)) return '文件名包含非法字符';
        return true;
    },
});

if (name) {
    await createFile(name);
}

// 自定义对话框
const instance = dialogService.open({
    type: 'custom',
    title: '导入数据',
    content: <ImportForm />,
    footer: (
        <>
            <button onClick={() => instance.close()}>取消</button>
            <button onClick={handleImport}>导入</button>
        </>
    ),
});
```

### 4.4 设计决策

| 决策点 | 选择 | 理由 |
|--------|------|------|
| 对话框队列 | 单例模式 | 防止多个对话框重叠，体验混乱 |
| 返回值 | Promise | 符合异步交互模式，代码线性 |
| 自定义内容 | ReactNode | 灵活支持任意组件 |
| 关闭方式 | 三种（按钮/ESC/遮罩） | 满足不同场景需求 |
| 验证逻辑 | validate 回调 | Prompt 输入即时验证 |

### 4.5 UI 组件设计

```typescript
// DialogContainer.tsx - 对话框容器组件
function DialogContainer() {
    const [dialogs, setDialogs] = useState<DialogInstance[]>([]);

    useEffect(() => {
        const unsubOpen = dialogService.onDialogOpened(addDialog);
        const unsubClose = dialogService.onDialogClosed(removeDialog);
        return () => { unsubOpen(); unsubClose(); };
    }, []);

    // 只显示最上面的对话框（队列模式）
    const activeDialog = dialogs[dialogs.length - 1];

    if (!activeDialog) return null;

    return (
        <div className="dialog-overlay" onClick={(e) => {
            if (activeDialog.config.maskClosable && e.target === e.currentTarget) {
                activeDialog.close();
            }
        }}>
            <DialogModal instance={activeDialog} />
        </div>
    );
}

// DialogModal.tsx - 对话框模态框组件
function DialogModal({ instance }) {
    const { type, title, message } = instance.config;

    return (
        <div className="dialog-modal" role="dialog" aria-modal="true">
            <div className="dialog-header">
                <h3>{title}</h3>
                {instance.config.closable && (
                    <button className="dialog-close" onClick={() => instance.close()}>×</button>
                )}
            </div>
            <div className="dialog-body">
                {type === 'prompt' ? (
                    <>
                        <p>{message}</p>
                        <input
                            type="text"
                            defaultValue={instance.config.defaultValue}
                            placeholder={instance.config.placeholder}
                            autoFocus
                        />
                    </>
                ) : (
                    <p>{message}</p>
                )}
            </div>
            {instance.config.footer !== false && (
                <div className="dialog-footer">
                    {type === 'alert' && (
                        <button onClick={() => {
                            instance.config.onConfirm?.();
                            instance.close();
                        }}>
                            {instance.config.confirmText || '确定'}
                        </button>
                    )}
                    {type === 'confirm' && (
                        <>
                            <button onClick={() => {
                                instance.config.onCancel?.();
                                instance.close();
                            }}>
                                {instance.config.cancelText || '取消'}
                            </button>
                            <button
                                className={`btn-${instance.config.confirmVariant || 'primary'}`}
                                onClick={() => {
                                    instance.config.onConfirm?.();
                                    instance.close();
                                }}
                            >
                                {instance.config.confirmText || '确认'}
                            </button>
                        </>
                    )}
                </div>
            )}
        </div>
    );
}
```

### 4.6 错误处理

| 错误场景 | 处理方式 |
|----------|----------|
| 重复 ID | 警告日志，生成新 ID |
| onConfirm 执行失败 | 不关闭对话框，显示错误通知 |
| validate 执行失败 | 显示错误信息，不关闭对话框 |
| 对话框 ID 不存在时关闭 | 无操作，不抛错 |

---

## 5. 数据流

### 5.1 通知数据流

```
服务调用 notificationService.show()
    │
    ▼
生成 Notification 对象
    │
    ▼
加入内部通知列表
    │
    ▼
触发 onNotificationAdded 事件
    │
    ▼
NotificationContainer 监听并更新状态
    │
    ▼
渲染 NotificationToast 组件
    │
    ▼
（定时结束）触发关闭
    │
    ▼
触发 onNotificationRemoved 事件
    │
    ▼
组件移除动画 → DOM 删除
```

### 5.2 对话框数据流

```
服务调用 dialogService.confirm()
    │
    ▼
创建 Promise 和 DialogInstance
    │
    ▼
加入对话框队列
    │
    ▼
触发 onDialogOpened 事件
    │
    ▼
DialogContainer 监听并显示
    │
    ▼
用户点击确认/取消
    │
    ├──► 确认 → 执行 onConfirm → resolve Promise → close()
    │
    └──► 取消 → 执行 onCancel → resolve false → close()
    │
    ▼
触发 onDialogClosed 事件
    │
    ▼
组件移除
```

---

## 6. 与现有服务集成

### 6.1 依赖关系

```
NotificationService ──┬──► ThemeService（获取主题样式）
                      └──► FocusService（通知点击时聚焦）

DialogService ────────┬──► ThemeService（获取主题样式）
                      ├──► FocusService（对话框内聚焦管理）
                      └──► ShortcutService（ESC 快捷键拦截）
```

### 6.2 集成点

```typescript
// NotificationService 集成 FocusService
show(config: NotificationConfig): string {
    const id = generateId();
    const notification = { ...config, id, createdAt: Date.now() };

    // 通知点击时聚焦到应用
    if (config.onClick) {
        const originalOnClick = config.onClick;
        notification.onClick = () => {
            this.focusService.focus();
            originalOnClick();
        };
    }

    this.notifications.set(id, notification);
    this._onNotificationAdded.fire(notification);
    return id;
}

// DialogService 集成 ShortcutService
open(config: CustomDialogConfig): DialogInstance {
    const id = generateId();

    // 注册 ESC 关闭快捷键
    if (config.escClosable !== false) {
        const escDispose = this.shortcutService.register({
            id: `dialog-${id}-esc`,
            shortcut: 'Escape',
            handler: () => this.close(id),
            when: () => this.isDialogOpen(id),
        });
        this.dialogEscHandlers.set(id, escDispose);
    }

    // ...创建实例
    return instance;
}
```

---

## 7. 测试策略

### 7.1 单元测试

```typescript
// NotificationService 测试
describe('NotificationService', () => {
    it('应成功添加通知', () => {
        const id = service.info('Test');
        expect(service.getNotifications()).toHaveLength(1);
    });

    it('应支持更新通知', () => {
        const id = service.info('Test');
        service.update(id, { title: 'Updated' });
        expect(service.getNotifications()[0].title).toBe('Updated');
    });

    it('应支持关闭通知', () => {
        const id = service.info('Test');
        service.close(id);
        expect(service.getNotifications()).toHaveLength(0);
    });

    it('应支持分组通知（替换）', () => {
        service.show({ type: 'info', title: 'First', group: 'g1' });
        service.show({ type: 'info', title: 'Second', group: 'g1' });
        expect(service.getNotifications()).toHaveLength(1);
        expect(service.getNotifications()[0].title).toBe('Second');
    });

    it('应触发事件', () => {
        const addedMock = vi.fn();
        service.onNotificationAdded(addedMock);
        service.info('Test');
        expect(addedMock).toHaveBeenCalled();
    });
});

// DialogService 测试
describe('DialogService', () => {
    it('应显示 Alert 对话框', async () => {
        const promise = dialogService.alert('Test');
        expect(dialogService.getOpenDialogs()).toHaveLength(1);

        // 模拟用户点击确认
        const event = new CustomEvent('dialog-confirm', { detail: { id: dialogService.getOpenDialogs()[0].id } });
        window.dispatchEvent(event);

        await promise;
        expect(dialogService.getOpenDialogs()).toHaveLength(0);
    });

    it('应支持 Confirm 对话框返回 boolean', async () => {
        const confirmPromise = dialogService.confirm('Are you sure?');

        // 模拟确认
        simulateConfirm();
        expect(await confirmPromise).toBe(true);

        // 模拟取消
        const cancelPromise = dialogService.confirm('Are you sure?');
        simulateCancel();
        expect(await cancelPromise).toBe(false);
    });

    it('应支持 Prompt 验证', async () => {
        const promise = dialogService.prompt({
            type: 'prompt',
            title: 'Test',
            message: 'Enter value',
            validate: (v) => v.length > 0,
        });

        // 输入空值应该不通过
        simulatePromptSubmit('');
        expect(dialogService.getOpenDialogs()).toHaveLength(1); // 未关闭

        // 输入有效值应该通过
        simulatePromptSubmit('valid');
        expect(await promise).toBe('valid');
    });
});
```

### 7.2 集成测试

```typescript
describe('NotificationService Integration', () => {
    it('通知点击应聚焦应用', async () => {
        const id = service.info('Click me');
        const notification = service.getNotifications()[0];

        // 模拟点击
        notification.onClick?.();

        expect(document.activeElement).toBe(document.body);
    });
});

describe('DialogService Integration', () => {
    it('ESC 应关闭对话框', async () => {
        dialogService.confirm('Test');

        // 模拟 ESC 按键
        fireEvent.keyDown(document, { key: 'Escape' });

        expect(dialogService.getOpenDialogs()).toHaveLength(0);
    });

    it('点击遮罩应关闭对话框（如果允许）', async () => {
        dialogService.open({
            type: 'custom',
            title: 'Test',
            content: <div>Content</div>,
            maskClosable: true,
        });

        // 模拟点击遮罩
        fireEvent.click(document.querySelector('.dialog-overlay')!);

        expect(dialogService.getOpenDialogs()).toHaveLength(0);
    });
});
```

---

## 8. 实施顺序

1. **NotificationService** - 依赖较少，独立实现
2. **DialogService** - 依赖 ShortcutService（ESC 关闭）

---

## 9. 待决策事项

| 事项 | 状态 | 建议 |
|------|------|------|
| 通知最大数量 | 待确认 | 建议 5 个，超过自动移除最旧 |
| 通知默认消失时间 | 待确认 | 建议 4500ms |
| 对话框 z-index 层级 | 待确认 | 建议 1000+，高于其他 UI |
| 是否需要音效 | 待确认 | 第一批不考虑，后续可扩展 |

---

## 10. 与后续批次的关系

### 依赖本服务的模块
- **错误处理模块** → 依赖 NotificationService 显示错误
- **保存服务** → 依赖 NotificationService 显示保存状态
- **导入导出功能** → 依赖 DialogService 显示确认对话框
- **设置界面** → 依赖 DialogService 显示自定义设置对话框

### 本服务依赖
- **ShortcutService** → DialogService 依赖其实现 ESC 关闭
- **ThemeService** → 两者都依赖其获取主题样式变量
- **FocusService** → 对话框聚焦管理、通知点击聚焦
