/**
 * Basic event emitter pattern for NestJS services.
 * Replaces global EventEmitter with typed, session-scoped events.
 */

export type EventHandler<T> = (e: T) => void;
export type Event<T> = (listener: EventHandler<T>) => void;

export class Emitter<T> {
    private listeners = new Set<EventHandler<T>>();

    fire(event: T): void {
        for (const listener of this.listeners) {
            listener(event);
        }
    }

    /**
     * Subscribe to events. Returns a dispose function.
     */
    on(listener: EventHandler<T>): () => void {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    /**
     * Expose as an Event<T> subscription function.
     */
    get event(): Event<T> {
        return (listener: EventHandler<T>) => this.on(listener);
    }
}
