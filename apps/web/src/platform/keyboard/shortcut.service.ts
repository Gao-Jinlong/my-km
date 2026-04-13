/**
 * KeyboardShortcutService - 快捷键服务
 *
 * 负责管理全局快捷键的注册和执行，提供：
 * - 快捷键注册和注销
 * - 快捷键冲突检测
 * - 快捷键执行
 * - 与 CommandService 集成
 */

import { Emitter, type IDisposable, toDisposable } from '@/base/common/event';
import { ServiceBase } from '@/platform/base/service-base';
import { container } from '@/platform/bootstrap';
import { ConditionalService } from '@/platform/conditional/service';
import { Service } from '@/platform/di';
import type { Logger } from '@/platform/monitor';
import { MonitorService } from '@/platform/monitor/service';
import type {
    KeyBinding,
    ShortcutConfig as KeyboardShortcutConfig,
    ShortcutHandler,
    ShortcutScope,
} from './types';

// 重新导出类型以便现有代码使用
export type { ShortcutHandler };

/**
 * 注册的快捷键信息
 */
interface RegisteredShortcut {
    keybinding: string;
    handler: ShortcutHandler;
    scope: string;
    dispose: () => void;
}

/**
 * 快捷键服务
 *
 * @example
 * ```typescript
 * import { KeyBinding, ShortcutScope } from '@/platform/keyboard';
 *
 * const shortcutService = container.get(KeyboardShortcutService);
 *
 * // 使用枚举注册快捷键
 * const dispose = shortcutService.register(KeyBinding.CTRL_S, {
 *     handle: () => saveCurrentFile(),
 *     description: '保存当前文件'
 * });
 *
 * // 注销快捷键
 * dispose.dispose();
 * ```
 */
@Service({ singleton: true })
export class KeyboardShortcutService extends ServiceBase {
    private shortcuts = new Map<string, RegisteredShortcut>();
    private keyDownListener: ((e: KeyboardEvent) => void) | null = null;
    private isInitialized = false;

    private _conditionalService?: ConditionalService;
    private _logger?: Logger;

    /**
     * 惰性获取条件服务（避免在容器初始化前访问）
     */
    private get conditionalService(): ConditionalService {
        if (!this._conditionalService) {
            this._conditionalService = container.get(ConditionalService);
        }
        return this._conditionalService;
    }

    /**
     * 惰性获取 logger（避免在容器初始化前访问）
     */
    protected get logger(): Logger {
        if (!this._logger) {
            this._logger = container.get(MonitorService).getLogger('keyboard');
        }
        return this._logger;
    }

    // 事件发射器
    private readonly _onShortcutExecuted = new Emitter<{ keybinding: string; scope: string }>();
    private readonly _onShortcutFailed = new Emitter<{ keybinding: string; error: Error }>();

    /**
     * 快捷键已执行事件
     */
    readonly onShortcutExecuted = this._onShortcutExecuted.event;

    /**
     * 快捷键执行失败事件
     */
    readonly onShortcutFailed = this._onShortcutFailed.event;

    /**
     * 初始化服务 - 必须在 registerConditionEvaluators 之后调用
     */
    initialize(): void {
        if (this.isInitialized) {
            return;
        }
        this.isInitialized = true;
        this.setupKeyboardListener();
    }

    /**
     * 设置键盘事件监听器
     */
    private setupKeyboardListener(): void {
        this.keyDownListener = (e: KeyboardEvent) => {
            const keybinding = this.normalizeKeybinding(e);
            const shortcut = this.shortcuts.get(keybinding);

            if (shortcut) {
                // 检查条件（如果注册了条件）
                if (shortcut.handler.condition) {
                    const isMet = this.conditionalService.evaluate(shortcut.handler.condition);
                    if (!isMet) {
                        // 条件不满足，阻止浏览器默认行为，但不执行快捷键
                        e.preventDefault();
                        e.stopPropagation();
                        return;
                    }
                }

                e.preventDefault();
                e.stopPropagation();

                try {
                    const result = shortcut.handler.handle();
                    // 如果是 Promise，处理异步错误
                    if (result instanceof Promise) {
                        result.catch(error => {
                            this._onShortcutFailed.fire({
                                keybinding,
                                error: error instanceof Error ? error : new Error(String(error)),
                            });
                        });
                    }
                    this._onShortcutExecuted.fire({
                        keybinding,
                        scope: shortcut.scope,
                    });
                } catch (error) {
                    this._onShortcutFailed.fire({
                        keybinding,
                        error: error instanceof Error ? error : new Error(String(error)),
                    });
                }
            }
        };

        window.addEventListener('keydown', this.keyDownListener);
    }

    /**
     * 规范化快捷键组合
     *
     * 将键盘事件转换为标准化的快捷键字符串
     * 例如：Ctrl+Key -> 'ctrl+k', Shift+Ctrl+S -> 'ctrl+shift+s'
     */
    private normalizeKeybinding(e: KeyboardEvent): string {
        const parts: string[] = [];

        // 修饰键顺序：ctrl, shift, alt, meta
        if (e.ctrlKey) parts.push('ctrl');
        if (e.shiftKey) parts.push('shift');
        if (e.altKey) parts.push('alt');
        if (e.metaKey) parts.push('meta');

        // 获取键名
        let key = e.key.toLowerCase();

        // 处理特殊键
        switch (key) {
            case 'control':
            case 'shift':
            case 'alt':
            case 'meta':
                // 修饰键本身不作为快捷键的一部分
                return parts.join('+');
            case ' ':
                key = 'space';
                break;
            case 'escape':
                key = 'escape';
                break;
            case 'backspace':
                key = 'backspace';
                break;
            case 'delete':
                key = 'delete';
                break;
            case 'arrowup':
                key = 'up';
                break;
            case 'arrowdown':
                key = 'down';
                break;
            case 'arrowleft':
                key = 'left';
                break;
            case 'arrowright':
                key = 'right';
                break;
        }

        // 单字母键不需要特殊处理
        if (key.length === 1 && /[a-z]/.test(key)) {
            parts.push(key);
        } else if (!parts.includes(key)) {
            parts.push(key);
        }

        return parts.join('+');
    }

    /**
     * 注册快捷键
     *
     * @param keybinding 快捷键组合，如 KeyBinding.CTRL_S 或 'ctrl+s'
     * @param handler 处理函数
     * @param scope 作用域（可选）
     * @returns IDisposable 用于注销快捷键
     *
     * @example
     * ```typescript
     * import { KeyBinding, ShortcutScope } from '@/platform/keyboard';
     *
     * // 使用枚举注册全局快捷键
     * shortcutService.register(KeyBinding.CTRL_S, {
     *     handle: () => saveFile(),
     *     description: '保存文件'
     * });
     *
     * // 注册作用域快捷键
     * shortcutService.register(KeyBinding.CTRL_SHIFT_P, {
     *     handle: () => openCommandPalette(),
     *     description: '打开命令面板',
     * }, ShortcutScope.GLOBAL);
     * ```
     */
    register(
        keybinding: KeyBinding | string,
        handler: ShortcutHandler,
        scope: ShortcutScope | string = 'global',
    ): IDisposable {
        // 确保服务已初始化
        this.initialize();

        const normalizedKeybinding = keybinding.toLowerCase();
        const existing = this.shortcuts.get(normalizedKeybinding);

        if (existing) {
            this.logger.warn(
                `快捷键 "${normalizedKeybinding}" 已被注册（作用域：${existing.scope}），正在覆盖`,
            );
        }

        const dispose = () => {
            this.shortcuts.delete(normalizedKeybinding);
        };

        this.shortcuts.set(normalizedKeybinding, {
            keybinding: normalizedKeybinding,
            handler,
            scope,
            dispose,
        });

        return toDisposable(dispose);
    }

    /**
     * 批量注册快捷键
     *
     * @param configs 快捷键配置数组
     * @returns IDisposable 用于注销所有快捷键
     */
    registerBatch(configs: KeyboardShortcutConfig[]): IDisposable {
        const disposables: IDisposable[] = [];

        for (const config of configs) {
            disposables.push(
                this.register(config.keybinding, config.handler, config.scope ?? 'global'),
            );
        }

        return toDisposable(() => {
            disposables.forEach(d => {
                d.dispose();
            });
        });
    }

    /**
     * 注销快捷键
     *
     * @param keybinding 快捷键组合
     * @returns 是否成功注销
     */
    unregister(keybinding: string): boolean {
        const normalizedKeybinding = keybinding.toLowerCase();
        const shortcut = this.shortcuts.get(normalizedKeybinding);

        if (shortcut) {
            shortcut.dispose();
            return true;
        }

        return false;
    }

    /**
     * 获取已注册的快捷键列表
     */
    getRegisteredShortcuts(): Array<{ keybinding: string; scope: string; description?: string }> {
        return Array.from(this.shortcuts.values()).map(s => ({
            keybinding: s.keybinding,
            scope: s.scope,
            description: s.handler.description,
        }));
    }

    /**
     * 手动触发快捷键（用于测试）
     */
    trigger(keybinding: string): boolean {
        const normalizedKeybinding = keybinding.toLowerCase();
        const shortcut = this.shortcuts.get(normalizedKeybinding);

        if (shortcut) {
            // 检查条件（如果注册了条件）
            if (shortcut.handler.condition) {
                const isMet = this.conditionalService.evaluate(shortcut.handler.condition);
                if (!isMet) {
                    // 条件不满足，不执行快捷键
                    return false;
                }
            }

            try {
                const result = shortcut.handler.handle();
                if (result instanceof Promise) {
                    result.catch(error => {
                        this._onShortcutFailed.fire({
                            keybinding: normalizedKeybinding,
                            error: error instanceof Error ? error : new Error(String(error)),
                        });
                    });
                }
                this._onShortcutExecuted.fire({
                    keybinding: normalizedKeybinding,
                    scope: shortcut.scope,
                });
                return true;
            } catch (error) {
                this._onShortcutFailed.fire({
                    keybinding: normalizedKeybinding,
                    error: error instanceof Error ? error : new Error(String(error)),
                });
                return false;
            }
        }

        return false;
    }

    override dispose(): void {
        // 移除键盘事件监听
        if (this.keyDownListener) {
            window.removeEventListener('keydown', this.keyDownListener);
            this.keyDownListener = null;
        }

        // 注销所有快捷键
        this.shortcuts.clear();

        // 释放事件发射器
        this._onShortcutExecuted.dispose();
        this._onShortcutFailed.dispose();

        super.dispose();
    }
}
