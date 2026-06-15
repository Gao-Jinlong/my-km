import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import { EventBus, type EventBusSubscription, type RunStreamEvent } from './event-bus';

/**
 * RedisEventBus 依赖的最小 Pub/Sub 接口。
 *
 * ioredis 的 Redis 实例天然满足此接口；测试注入 FakeRedis。
 * 抽出此接口是为了解耦 ioredis 实例化——RedisEventBus 只编排"handler 管理 +
 * 懒订阅 + 序列化 + lifecycle"逻辑，真实 new Redis(url) 发生在 AiModule.useFactory。
 */
export interface RedisPubSubLike {
    publish(channel: string, message: string): Promise<unknown>;
    subscribe(...channels: string[]): Promise<unknown>;
    unsubscribe(...channels: string[]): Promise<unknown>;
    on(event: 'message', listener: (channel: string, message: string) => void): unknown;
    quit(): Promise<unknown>;
}

/**
 * RedisEventBus — EventBus 的多副本实现（spec 3.1/3.4/6.3）。
 *
 * 基于 Redis Pub/Sub：publisher 连接 PUBLISH，subscriber 连接 SUBSCRIBE。
 * ioredis 的 subscribe 模式独占连接（订阅后该连接不能执行普通命令），故分离
 * publisher/subscriber 两条连接。channel = run:{runId}（runChannel helper）。
 *
 * 懒订阅（spec 3.4）：某 channel 首个 handler 到达才 SUBSCRIBE，最后一个离开才
 * UNSUBSCRIBE；channel → handlers 由本类管理，subscriber 每 channel 只订阅一次。
 *
 * 序列化：RunStreamEvent 经 JSON.stringify 传输，message 事件 JSON.parse 还原。
 * subscribe() 同步返回（fire-and-forget SUBSCRIBE），调用方（P2-3 joinStream）
 * 负责"先订阅后回放"时序（spec 3.5）。
 */
@Injectable()
export class RedisEventBus extends EventBus implements OnModuleDestroy {
    private readonly logger = new Logger(RedisEventBus.name);
    private readonly publisher: RedisPubSubLike;
    private readonly subscriber: RedisPubSubLike;
    /** channel → handlers；懒订阅的引用计数靠 Set.size */
    private readonly handlers = new Map<string, Set<(event: RunStreamEvent) => void>>();

    constructor(publisher: RedisPubSubLike, subscriber: RedisPubSubLike) {
        super();
        this.publisher = publisher;
        this.subscriber = subscriber;
        this.subscriber.on('message', (channel, message) => {
            const handlers = this.handlers.get(channel);
            if (!handlers) return;
            let event: RunStreamEvent;
            try {
                event = JSON.parse(message) as RunStreamEvent;
            } catch (err) {
                this.logger.warn(
                    `Discarding unparseable message on ${channel}: ${(err as Error).message}`,
                );
                return;
            }
            for (const handler of handlers) handler(event);
        });
    }

    override async publish(channel: string, event: RunStreamEvent): Promise<void> {
        await this.publisher.publish(channel, JSON.stringify(event));
    }

    override subscribe(
        channel: string,
        handler: (event: RunStreamEvent) => void,
    ): EventBusSubscription {
        let set = this.handlers.get(channel);
        if (!set) {
            set = new Set();
            this.handlers.set(channel, set);
            // 懒订阅：该 channel 首个 handler 才真正 SUBSCRIBE（fire-and-forget）
            void this.subscriber.subscribe(channel);
        }
        set.add(handler);
        return {
            unsubscribe: () => {
                const current = this.handlers.get(channel);
                if (!current) return;
                current.delete(handler);
                if (current.size === 0) {
                    this.handlers.delete(channel);
                    // 懒退订：最后一个 handler 离开才 UNSUBSCRIBE
                    void this.subscriber.unsubscribe(channel);
                }
            },
        };
    }

    async onModuleDestroy(): Promise<void> {
        await Promise.all([this.publisher.quit(), this.subscriber.quit()]).catch(err => {
            this.logger.warn(`Redis quit error: ${(err as Error).message}`);
        });
    }
}
