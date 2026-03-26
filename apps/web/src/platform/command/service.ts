// apps/web/src/platform/command/service.ts

import { Emitter, type IDisposable } from '../../base/common/event';
import { ServiceBase } from '../../platform/base/service-base';
import { Service } from '../../platform/di';
import type {
    CommandContext,
    CommandDefinition,
    CommandDidExecuteEvent,
    CommandFailedEvent,
    CommandHistoryItem,
    CommandInterceptor,
    CommandMetadata,
    CommandWillExecuteEvent,
    ICommandService,
} from './types';

@Service({ singleton: true })
export class CommandService extends ServiceBase implements ICommandService {
    /** 命令注册表 */
    private readonly commands = new Map<string, CommandDefinition>();

    /** 命令拦截器 */
    private readonly interceptors: CommandInterceptor[] = [];

    /** 命令执行历史 */
    private readonly history: CommandHistoryItem[] = [];
    private readonly historyLimit = 100;

    /** 事件发射器 */
    private readonly _onWillExecuteCommand = new Emitter<CommandWillExecuteEvent>();
    private readonly _onDidExecuteCommand = new Emitter<CommandDidExecuteEvent>();
    private readonly _onCommandFailed = new Emitter<CommandFailedEvent>();

    /** 公开事件 */
    readonly onWillExecuteCommand = this._onWillExecuteCommand.event;
    readonly onDidExecuteCommand = this._onDidExecuteCommand.event;
    readonly onCommandFailed = this._onCommandFailed.event;

    /**
     * 注册命令
     */
    registerCommand(definition: CommandDefinition): IDisposable {
        if (this.commands.has(definition.id)) {
            console.warn(`命令 ${definition.id} 已被注册，将被覆盖`);
        }

        this.commands.set(definition.id, definition);

        return {
            dispose: () => {
                this.unregisterCommand(definition.id);
            },
        };
    }

    /**
     * 注销命令
     */
    unregisterCommand(commandId: string): void {
        this.commands.delete(commandId);
    }

    /**
     * 检查命令是否已注册
     */
    hasCommand(commandId: string): boolean {
        return this.commands.has(commandId);
    }

    /**
     * 获取命令元数据
     */
    getCommand(commandId: string): CommandMetadata | undefined {
        return this.commands.get(commandId);
    }

    /**
     * 获取所有已注册命令
     */
    getAllCommands(): CommandMetadata[] {
        return Array.from(this.commands.values()).map(cmd => ({
            id: cmd.id,
            label: cmd.label,
            description: cmd.description,
            category: cmd.category,
            shortcut: cmd.shortcut,
            icon: cmd.icon,
            enabled: cmd.enabled,
            visible: cmd.visible,
            requiresPermission: cmd.requiresPermission,
        }));
    }

    /**
     * 执行命令
     */
    async executeCommand<T>(commandId: string, ...args: unknown[]): Promise<T> {
        return this.executeCommandWithContext<T>(commandId, {
            args,
            source: 'api',
        });
    }

    /**
     * 带上下文执行命令
     */
    async executeCommandWithContext<T>(
        commandId: string,
        context: Partial<CommandContext>,
    ): Promise<T> {
        const startTime = Date.now();
        const command = this.commands.get(commandId);

        if (!command) {
            throw new Error(`命令未找到：${commandId}`);
        }

        // 构建完整上下文
        const fullContext: CommandContext = {
            commandId,
            args: context.args || [],
            source: context.source || 'api',
            targetElement: context.targetElement,
            ...context,
        };

        // 执行拦截器 before
        const sortedInterceptors = [...this.interceptors].sort(
            (a, b) => (b.priority ?? 0) - (a.priority ?? 0),
        );

        for (const interceptor of sortedInterceptors) {
            if (interceptor.before) {
                try {
                    const result = await interceptor.before(fullContext);
                    if (result === false) {
                        // 拦截器取消执行
                        return undefined as T;
                    }
                } catch (error) {
                    console.warn(`拦截器 before 执行失败：${error}`);
                    // 继续执行
                }
            }
        }

        // 触发即将执行事件
        this._onWillExecuteCommand.fire({ context: fullContext });

        let result: unknown;
        let error: Error | undefined;

        try {
            // 执行命令处理器
            result = await command.handler(fullContext);
        } catch (e) {
            error = e instanceof Error ? e : new Error(String(e));

            // 触发失败事件
            this._onCommandFailed.fire({ context: fullContext, error });

            // 执行拦截器 onError
            for (const interceptor of sortedInterceptors) {
                if (interceptor.onError) {
                    try {
                        interceptor.onError(fullContext, error);
                    } catch (e) {
                        console.warn(`拦截器 onError 执行失败：${e}`);
                    }
                }
            }

            throw error;
        } finally {
            // 记录历史
            const duration = Date.now() - startTime;
            this.addToHistory({
                commandId,
                timestamp: startTime,
                args: fullContext.args,
                source: fullContext.source,
                result,
                error,
                duration,
            });
        }

        // 触发已执行事件
        this._onDidExecuteCommand.fire({ context: fullContext, result });

        // 执行拦截器 after
        for (const interceptor of sortedInterceptors) {
            if (interceptor.after) {
                try {
                    interceptor.after(fullContext, result);
                } catch (e) {
                    console.warn(`拦截器 after 执行失败：${e}`);
                }
            }
        }

        return result as T;
    }

    /**
     * 注册命令拦截器
     */
    addInterceptor(interceptor: CommandInterceptor): IDisposable {
        this.interceptors.push(interceptor);

        return {
            dispose: () => {
                const index = this.interceptors.indexOf(interceptor);
                if (index !== -1) {
                    this.interceptors.splice(index, 1);
                }
            },
        };
    }

    /**
     * 获取命令历史
     */
    getHistory(limit?: number): CommandHistoryItem[] {
        const l = limit ?? this.history.length;
        return this.history.slice(-l);
    }

    /**
     * 清空命令历史
     */
    clearHistory(): void {
        this.history.splice(0, this.history.length);
    }

    /**
     * 获取最近执行的命令
     */
    getLastExecuted(): CommandHistoryItem | null {
        return this.history.length > 0 ? this.history[this.history.length - 1] : null;
    }

    override dispose(): void {
        this._onWillExecuteCommand.dispose();
        this._onDidExecuteCommand.dispose();
        this._onCommandFailed.dispose();
        this.commands.clear();
        this.interceptors.splice(0, this.interceptors.length);
        this.history.splice(0, this.history.length);
        super.dispose();
    }

    private addToHistory(item: CommandHistoryItem): void {
        this.history.push(item);
        if (this.history.length > this.historyLimit) {
            this.history.shift();
        }
    }
}
