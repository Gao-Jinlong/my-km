/**
 * 面板服务
 *
 * 管理工作区面板的展开/折叠状态，提供统一的面板控制 API
 */

import { Emitter, type IDisposable, toDisposable } from '@/base/common/event';
import { ServiceBase } from '@/platform/base/service-base';
import { Service } from '@/platform/di';

/**
 * 面板配置
 */
export interface PanelConfig {
    /** 面板 ID */
    id: string;
    /** 是否可折叠 */
    collapsible: boolean;
    /** 是否可隐藏 */
    hideable: boolean;
    /** 默认大小（百分比） */
    defaultSize: number;
    /** 最小大小（百分比） */
    minSize: number;
    /** 最大大小（百分比） */
    maxSize?: number;
    /** 折叠时的大小（百分比） */
    collapsedSize: number;
}

/**
 * 面板状态
 */
export interface PanelState {
    /** 面板 ID */
    id: string;
    /** 是否展开 */
    expanded: boolean;
    /** 当前大小（百分比） */
    size: number;
    /** 是否已注册 */
    registered: boolean;
}

/**
 * 面板服务配置选项
 */
export interface PanelServiceOptions {
    /** 自动隐藏阈值（百分比）- 当面板拖拽到此大小以下时自动隐藏 */
    autoHideThreshold?: number;
    /** 展开时的恢复大小（百分比） */
    restoreSize?: number;
}

/**
 * 面板服务
 *
 * 管理所有工作区面板的状态，提供展开/折叠/隐藏控制
 *
 * @example
 * ```typescript
 * const panelService = container.get(PanelService);
 *
 * // 注册面板
 * panelService.register('sidebar', {
 *     collapsible: true,
 *     hideable: true,
 *     defaultSize: 20,
 *     minSize: 15,
 *     maxSize: 40,
 *     collapsedSize: 4,
 * });
 *
 * // 监听状态变化
 * panelService.onDidChangePanel(state => {
 *     console.log(`Panel ${state.id} state changed:`, state);
 * });
 *
 * // 控制面板
 * panelService.toggle('sidebar');
 * panelService.expand('sidebar');
 * panelService.collapse('sidebar');
 * ```
 */
@Service({ singleton: true })
export class PanelService extends ServiceBase {
    private readonly _panels = new Map<string, PanelConfig>();
    private readonly _states = new Map<string, PanelState>();

    // 配置选项
    private readonly _options: Required<PanelServiceOptions>;

    // 事件发射器
    private readonly _onDidChangePanel = new Emitter<PanelState>();
    private readonly _onDidChangeSize = new Emitter<{ id: string; size: number }>();

    /** 面板状态变化事件 */
    readonly onDidChangePanel = this._onDidChangePanel.event;

    /** 面板大小变化事件 */
    readonly onDidChangeSize = this._onDidChangeSize.event;

    constructor() {
        super();
        this._options = {
            autoHideThreshold: 10, // 默认 10% 阈值
            restoreSize: 20, // 默认恢复 20%
        };
    }

    /**
     * 注册面板
     *
     * @param id 面板唯一标识
     * @param config 面板配置
     * @returns 注销函数
     */
    register(id: string, config: PanelConfig): IDisposable {
        if (this._panels.has(id)) {
            console.warn(`Panel "${id}" already registered, overriding`);
        }

        this._panels.set(id, config);
        this._states.set(id, {
            id,
            expanded: true,
            size: config.defaultSize,
            registered: true,
        });

        this._onDidChangePanel.fire(this._states.get(id)!);

        return toDisposable(() => this.unregister(id));
    }

    /**
     * 注销面板
     */
    unregister(id: string): void {
        this._panels.delete(id);
        this._states.delete(id);
        this._onDidChangePanel.fire({
            id,
            expanded: false,
            size: 0,
            registered: false,
        });
    }

    /**
     * 获取面板状态
     */
    getPanelState(id: string): PanelState | undefined {
        return this._states.get(id);
    }

    /**
     * 获取所有面板状态
     */
    getAllPanelStates(): Map<string, PanelState> {
        return new Map(this._states);
    }

    /**
     * 切换面板展开/折叠状态
     */
    toggle(id: string): void {
        const state = this._states.get(id);
        if (!state) {
            console.warn(`Panel "${id}" not found`);
            return;
        }

        const config = this._panels.get(id);
        if (!config?.collapsible) {
            console.warn(`Panel "${id}" is not collapsible`);
            return;
        }

        state.expanded = !state.expanded;
        if (!state.expanded) {
            state.size = config.collapsedSize;
        } else {
            // 展开时恢复默认大小
            state.size = config.defaultSize;
        }

        this._onDidChangePanel.fire(state);
    }

    /**
     * 展开面板
     */
    expand(id: string, size?: number): void {
        const state = this._states.get(id);
        if (!state) {
            console.warn(`Panel "${id}" not found`);
            return;
        }

        const config = this._panels.get(id);
        if (!config?.collapsible) {
            console.warn(`Panel "${id}" is not collapsible`);
            return;
        }

        state.expanded = true;
        state.size = size ?? config.defaultSize;

        this._onDidChangePanel.fire(state);
    }

    /**
     * 折叠面板
     */
    collapse(id: string): void {
        const state = this._states.get(id);
        if (!state) {
            console.warn(`Panel "${id}" not found`);
            return;
        }

        const config = this._panels.get(id);
        if (!config?.collapsible) {
            console.warn(`Panel "${id}" is not collapsible`);
            return;
        }

        state.expanded = false;
        state.size = config.collapsedSize;

        this._onDidChangePanel.fire(state);
    }

    /**
     * 隐藏面板（完全隐藏，不只是折叠）
     */
    hide(id: string): void {
        const state = this._states.get(id);
        if (!state) {
            console.warn(`Panel "${id}" not found`);
            return;
        }

        const config = this._panels.get(id);
        if (!config?.hideable) {
            console.warn(`Panel "${id}" is not hideable`);
            return;
        }

        state.expanded = false;
        state.size = 0;

        this._onDidChangePanel.fire(state);
    }

    /**
     * 显示面板
     */
    show(id: string, size?: number): void {
        const state = this._states.get(id);
        if (!state) {
            console.warn(`Panel "${id}" not found`);
            return;
        }

        const config = this._panels.get(id);
        if (!config) {
            console.warn(`Panel "${id}" config not found`);
            return;
        }

        state.expanded = true;
        state.size = size ?? config.defaultSize;

        this._onDidChangePanel.fire(state);
    }

    /**
     * 更新面板大小
     *
     * @param id 面板 ID
     * @param size 新大小（百分比）
     * @param checkAutoHide 是否检查自动隐藏（当大小低于阈值时自动隐藏）
     */
    setSize(id: string, size: number, checkAutoHide = false): void {
        const state = this._states.get(id);
        const config = this._panels.get(id);

        if (!state || !config) {
            return;
        }

        // 检查是否需要自动隐藏
        if (checkAutoHide && config.hideable && size < this._options.autoHideThreshold) {
            this.hide(id);
            return;
        }

        // 限制大小在允许范围内
        const minSize = config.minSize;
        const maxSize = config.maxSize ?? 100;
        state.size = Math.max(minSize, Math.min(maxSize, size));

        // 如果大小变化到折叠大小以下，更新展开状态
        if (config.collapsible && state.size <= config.collapsedSize + 1) {
            state.expanded = false;
        } else if (state.size > config.collapsedSize + 1) {
            state.expanded = true;
        }

        this._onDidChangeSize.fire({ id, size: state.size });
    }

    /**
     * 检查面板是否展开
     */
    isExpanded(id: string): boolean {
        return this._states.get(id)?.expanded ?? false;
    }

    /**
     * 检查面板是否可见（展开且大小大于 0）
     */
    isVisible(id: string): boolean {
        const state = this._states.get(id);
        return !!(state?.expanded && state.size > 0);
    }

    /**
     * 设置自动隐藏阈值
     */
    setAutoHideThreshold(threshold: number): void {
        this._options.autoHideThreshold = threshold;
    }

    /**
     * 设置展开时恢复的大小
     */
    setRestoreSize(size: number): void {
        this._options.restoreSize = size;
    }

    override dispose(): void {
        this._panels.clear();
        this._states.clear();
        this._onDidChangePanel.dispose();
        this._onDidChangeSize.dispose();
        super.dispose();
    }
}
