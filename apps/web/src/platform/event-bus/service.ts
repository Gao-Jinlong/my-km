import { Inject, Service } from '@/platform/di';
import type { Logger } from '@/platform/monitor';
import { MonitorService } from '@/platform/monitor/service';
import { Emitter } from '../../base/common/event';
import { ServiceBase } from '../../platform/base/service-base';
import type {
    EventDefinition,
    EventHistoryOptions,
    EventInterceptor,
    EventListener,
    EventSubscriptionOptions,
} from './types';

interface Subscription {
    eventType: string;
    listener: EventListener<unknown>;
    options?: EventSubscriptionOptions;
}

/**
 * 事件总线服务
 */
@Service({ singleton: true })
export class EventBusService extends ServiceBase {
    private readonly _logger: Logger;

    /**
     * 获取 logger
     */
    protected get logger(): Logger {
        return this._logger;
    }

    constructor(@Inject(MonitorService) monitorService: MonitorService) {
        super();
        this._logger = monitorService.getLogger('event-bus');
    }

    // 事件发射器
    private readonly _onEventPublished = new Emitter<EventDefinition>();
    private readonly _onEventHandled = new Emitter<{ event: EventDefinition; listeners: number }>();

    /** 事件发布事件 */
    readonly onEventPublished = this._onEventPublished.event;

    /** 事件处理完成事件 */
    readonly onEventHandled = this._onEventHandled.event;

    /** 事件注册表 */
    private eventRegistry = new Map<string, Set<EventListener>>();

    /** 拦截器列表 */
    private interceptors: EventInterceptor[] = [];

    /** 事件历史 */
    private eventHistory: EventDefinition[] = [];
    private readonly historyLimit = 1000;

    /** 订阅列表 */
    private subscriptions = new Map<string, Subscription[]>();

    /**
     * 注册事件类型
     */
    registerEvent(eventType: { type: string; tags?: string[] }): void {
        if (!this.eventRegistry.has(eventType.type)) {
            this.eventRegistry.set(eventType.type, new Set());
        }
    }

    /**
     * 订阅事件
     */
    subscribe<T>(
        eventType: string,
        listener: EventListener<T>,
        options?: EventSubscriptionOptions,
    ) {
        const subscription: Subscription = {
            eventType,
            listener: listener as EventListener<unknown>,
            options,
        };

        let subs = this.subscriptions.get(eventType);
        if (!subs) {
            subs = [];
            this.subscriptions.set(eventType, subs);
        }
        subs.push(subscription);

        // 确保事件已注册
        this.registerEvent({ type: eventType });

        return {
            dispose: () => {
                const index = subs?.indexOf(subscription);
                if (index !== undefined && index !== -1) {
                    subs?.splice(index, 1);
                }
            },
        };
    }

    /**
     * 发布事件
     */
    async publish<T>(event: Omit<EventDefinition<T>, 'timestamp' | 'eventId'>): Promise<void> {
        // 生成事件 ID 和时间戳
        const fullEvent: EventDefinition<T> = {
            ...event,
            eventId: this._generateEventId(),
            timestamp: Date.now(),
        };

        // 经过拦截器链
        let processedEvent: EventDefinition<T> | null = fullEvent;
        for (const interceptor of this.interceptors) {
            processedEvent = interceptor(
                processedEvent as EventDefinition<unknown>,
            ) as EventDefinition<T> | null;
            if (processedEvent === null) {
                return; // 被拦截器阻止
            }
        }

        // 触发 onEventPublished
        this._onEventPublished.fire(processedEvent as EventDefinition);

        // 查找并调用监听器
        const listeners = this._getListenersForEvent(processedEvent as EventDefinition);

        // 按优先级排序
        listeners.sort((a, b) => (b.options?.priority ?? 0) - (a.options?.priority ?? 0));

        // 调用监听器
        for (const subscription of listeners) {
            try {
                const result = subscription.listener(processedEvent);
                if (result instanceof Promise) {
                    // 异步监听器，不等待
                    result.catch(err => {
                        this.logger.error('Listener error for {type}:', processedEvent.type, err);
                    });
                }
            } catch (err) {
                this.logger.error('Listener error for {type}:', processedEvent.type, err);
            }
        }

        // 触发 onEventHandled
        this._onEventHandled.fire({
            event: processedEvent as EventDefinition,
            listeners: listeners.length,
        });

        // 记录历史
        this._addToHistory(processedEvent as EventDefinition);
    }

    /**
     * 添加事件拦截器
     */
    addInterceptor(interceptor: EventInterceptor) {
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
     * 获取事件历史
     */
    getHistory(options?: EventHistoryOptions): EventDefinition[] {
        let history = [...this.eventHistory];

        if (options?.type) {
            history = history.filter(e => e.type === options.type);
        }
        if (options?.source) {
            history = history.filter(e => e.source === options.source);
        }

        const limit = options?.limit ?? history.length;
        return history.slice(-limit);
    }

    /**
     * 清空历史
     */
    clearHistory(): void {
        this.eventHistory = [];
    }

    /**
     * 获取订阅者数量
     */
    getSubscriberCount(eventType: string): number {
        const subs = this.subscriptions.get(eventType);
        return subs ? subs.length : 0;
    }

    /**
     * 移除所有监听器
     */
    clearListeners(eventType?: string): void {
        if (eventType) {
            this.subscriptions.delete(eventType);
        } else {
            this.subscriptions.clear();
        }
    }

    override dispose(): void {
        this._onEventPublished.dispose();
        this._onEventHandled.dispose();
        this.eventRegistry.clear();
        this.interceptors = [];
        this.eventHistory = [];
        this.subscriptions.clear();
        super.dispose();
    }

    // ===== 私有方法 =====

    private _generateEventId(): string {
        return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    }

    private _getListenersForEvent(event: EventDefinition): Subscription[] {
        const allListeners = this.subscriptions.get(event.type) || [];

        // 应用过滤
        return allListeners.filter(sub => {
            const opts = sub.options;
            if (!opts) return true;

            // 来源过滤
            if (opts.source && event.source !== opts.source) {
                return false;
            }

            // 标签过滤
            if (opts.tags && opts.tags.length > 0) {
                const eventTags = event.tags || [];
                return opts.tags.some(tag => eventTags.includes(tag));
            }

            return true;
        });
    }

    private _addToHistory(event: EventDefinition): void {
        this.eventHistory.push(event);
        if (this.eventHistory.length > this.historyLimit) {
            this.eventHistory.shift(); // 移除最早的事件
        }
    }
}
