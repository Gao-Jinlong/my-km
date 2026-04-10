/**
 * 右键菜单服务
 *
 * 系统级服务，允许各模块注册自己的菜单提供者
 * 支持菜单项分组、条件显示、子菜单等
 */

import { Emitter, type IDisposable, toDisposable } from '@/base/common/event';
import { ServiceBase } from '@/platform/base/service-base';
import { container } from '@/platform/bootstrap';
import { Service } from '@/platform/di';
import { LoggerService } from '@/platform/logger/service';
import type {
    ContextMenuContext,
    ContextMenuGroup,
    ContextMenuProvider as IContextMenuProvider,
} from './types';

/**
 * 右键菜单服务
 *
 * @example
 * ```typescript
 * // 注册提供者
 * const dispose = contextMenuService.registerProvider('fileTree', (ctx) => {
 *     return [{
 *         id: 'file-actions',
 *         entries: [
 *             { id: 'open', label: '打开', action: () => openFile(ctx.data.path) },
 *             { id: 'sep-1', type: 'separator' },
 *             { id: 'delete', label: '删除', action: () => deleteFile(ctx.data.path) },
 *         ],
 *     }];
 * });
 *
 * // 显示菜单
 * contextMenuService.show(event, { data: { path: '/path/to/file' } });
 * ```
 */
@Service({ singleton: true })
export class ContextMenuService extends ServiceBase {
    private readonly logger = container.get(LoggerService).getLogger('context-menu');

    private providers = new Map<string, IContextMenuProvider>();

    // 事件发射器
    private readonly _onWillShowMenu = new Emitter<ContextMenuContext>();
    private readonly _onMenuShown = new Emitter<ContextMenuContext>();
    private readonly _onMenuDismissed = new Emitter<void>();

    /**
     * 菜单即将显示事件
     */
    readonly onWillShowMenu = this._onWillShowMenu.event;

    /**
     * 菜单已显示事件
     */
    readonly onMenuShown = this._onMenuShown.event;

    /**
     * 菜单已关闭事件
     */
    readonly onMenuDismissed = this._onMenuDismissed.event;

    /**
     * 注册菜单提供者
     *
     * @param id 提供者 ID（用于取消注册）
     * @param provider 提供者函数
     * @returns IDisposable 用于取消注册
     *
     * @example
     * ```typescript
     * const dispose = service.registerProvider('myModule', (ctx) => {
     *     return [{ id: 'group1', entries: [...] }];
     * });
     *
     * // 稍后取消注册
     * dispose.dispose();
     * ```
     */
    registerProvider(id: string, provider: IContextMenuProvider): IDisposable {
        if (this.providers.has(id)) {
            this.logger.warn(`ContextMenuProvider "${id}" already registered, overriding`);
        }

        this.providers.set(id, provider);

        return toDisposable(() => {
            this.providers.delete(id);
        });
    }

    /**
     * 显示右键菜单
     *
     * @param event 鼠标事件或 React 鼠标事件
     * @param context 上下文数据
     *
     * @example
     * ```typescript
     * // 在文件树节点上
     * const handleContextMenu = (event: React.MouseEvent, nodeData: FileNode) => {
     *     event.preventDefault();
     *     contextMenuService.show(event, {
     *         target: event.currentTarget,
     *         data: nodeData,
     *         x: event.clientX,
     *         y: event.clientY,
     *     });
     * };
     * ```
     */
    async show(
        event: MouseEvent | React.MouseEvent,
        context?: Partial<ContextMenuContext>,
    ): Promise<void> {
        event.preventDefault();

        const ctx: ContextMenuContext = {
            target: context?.target || (event.target as HTMLElement),
            targetNode: context?.targetNode,
            data: context?.data,
            x: event.clientX,
            y: event.clientY,
        };

        // 触发即将显示事件
        this._onWillShowMenu.fire(ctx);

        // 收集所有提供者的菜单项
        const allGroups: ContextMenuGroup[] = [];

        for (const provider of this.providers.values()) {
            try {
                const groups = await provider(ctx);
                allGroups.push(...groups);
            } catch (error) {
                this.logger.error(`ContextMenuProvider error:`, error);
            }
        }

        // 过滤隐藏的项
        const filteredGroups = allGroups.map(group => ({
            ...group,
            entries: group.entries.filter(entry => {
                if ('hidden' in entry && entry.hidden) {
                    return false;
                }
                return true;
            }),
        }));

        // 触发已显示事件（由 UI 组件监听并渲染）
        // 注意：实际的菜单渲染由 React 组件处理
        // 这里通过事件传递数据给 UI 组件
        this._onMenuShown.fire({ ...ctx, data: { ...ctx.data, groups: filteredGroups } });
    }

    /**
     * 关闭菜单
     */
    dismiss(): void {
        this._onMenuDismissed.fire();
    }

    /**
     * 获取所有注册的提供者 ID（用于调试）
     */
    getProviderIds(): string[] {
        return Array.from(this.providers.keys());
    }

    override dispose(): void {
        this.providers.clear();
        this._onWillShowMenu.dispose();
        this._onMenuShown.dispose();
        this._onMenuDismissed.dispose();
        super.dispose();
    }
}
