/**
 * EventBus — 跨副本实时事件分发抽象（spec 3.1/3.4/6.3）。
 *
 * channel 拓扑：run:{runId}，按 run 分 channel（非全集群广播，spec 3.4）。
 * 两种实现：
 *   - RedisEventBus（多副本，P2 后续阶段）：Redis PUBLISH/SUBSCRIBE
 *   - InProcessEventBus（单进程降级，本地开发不依赖 Redis）
 *
 * 消费方注入 abstract class EventBus token，由 AiModule 按 env 绑定实现。
 * 用 abstract class 而非 interface：interface 编译后消失无法作 NestJS DI token，
 * abstract class 既能做 token 又能约束实现形状。
 */

/** spec 3.2/3.4 事件载荷：状态边界事件与临时(messages)事件统一形状 */
export interface RunStreamEvent {
    /** per-run 单调递增序号，重连去重锚（spec 3.5） */
    seq: number;
    /** LangGraph 标准事件名：metadata | messages | values | tasks | end | error */
    eventType: string;
    /** SSE 事件 data 原样载荷 */
    payload: unknown;
}

/** 订阅句柄：unsubscribe 后该订阅不再收到事件 */
export interface EventBusSubscription {
    unsubscribe(): void;
}

/**
 * channel 命名规则：run:{runId}（spec 3.4，按 run 分 channel）。
 * 消费方构造 channel 字符串的唯一合法方式，禁止手拼 `run:xxx`。
 */
export function runChannel(runId: string): string {
    return `run:${runId}`;
}

/**
 * EventBus abstract token —— NestJS provider token + 实现形状约束。
 *
 * publish 返回 Promise<void>：InProcess 实现内部同步，但接口与未来
 * RedisEventBus（PUBLISH 是 async）对齐。
 */
export abstract class EventBus {
    /** 发布事件到 channel。Redis 实现走 PUBLISH，InProcess 实现走 Emitter.fire。 */
    abstract publish(channel: string, event: RunStreamEvent): Promise<void>;

    /** 订阅 channel 的事件流，返回可销毁句柄（懒订阅由实现决定）。 */
    abstract subscribe(
        channel: string,
        handler: (event: RunStreamEvent) => void,
    ): EventBusSubscription;
}
