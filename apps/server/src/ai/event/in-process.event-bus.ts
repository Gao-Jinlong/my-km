import { Injectable } from '@nestjs/common';
import { Emitter } from '../../base/common/event';
import { EventBus, type EventBusSubscription, type RunStreamEvent } from './event-bus';

/**
 * InProcessEventBus — EventBus 的单进程降级实现（spec 6.3）。
 *
 * 基于 base/common/event 的 Emitter<T>：每 channel 一个 Emitter，首次
 * publish/subscribe 时懒创建。publish 同步 fire（返回 resolved Promise），
 * subscribe 返回包装 Emitter.on dispose 的 EventBusSubscription。
 *
 * 多副本部署应改用 RedisEventBus（P2 后续阶段）；本地开发/单进程无需 Redis。
 * 消费方注入 abstract class EventBus token，由 AiModule 绑定本实现。
 */
@Injectable()
export class InProcessEventBus extends EventBus {
    /** channel → Emitter，首次访问懒创建 */
    private readonly channels = new Map<string, Emitter<RunStreamEvent>>();

    override async publish(channel: string, event: RunStreamEvent): Promise<void> {
        this.getOrCreate(channel).fire(event);
    }

    override subscribe(
        channel: string,
        handler: (event: RunStreamEvent) => void,
    ): EventBusSubscription {
        const dispose = this.getOrCreate(channel).on(handler);
        return { unsubscribe: dispose };
    }

    private getOrCreate(channel: string): Emitter<RunStreamEvent> {
        let emitter = this.channels.get(channel);
        if (!emitter) {
            emitter = new Emitter<RunStreamEvent>();
            this.channels.set(channel, emitter);
        }
        return emitter;
    }
}
