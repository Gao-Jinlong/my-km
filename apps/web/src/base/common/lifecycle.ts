import { isIterable } from './types';

export type IDisposable = {
    dispose(): void;
};

export function dispose<T extends IDisposable>(disposables: T): T;
export function dispose<T extends IDisposable>(disposables: T | undefined): T | undefined;
export function dispose<T extends IDisposable, A extends Iterable<T>>(disposables: A): A;
export function dispose<T extends IDisposable>(disposables: Array<T>): Array<T>;
export function dispose<T extends IDisposable>(disposables: ReadonlyArray<T>): ReadonlyArray<T>;
export function dispose<T extends IDisposable>(arg: T | Iterable<T> | undefined): any {
    if (isIterable(arg)) {
        const errors: any[] = [];

        for (const disposable of arg) {
            try {
                disposable.dispose();
            } catch (error) {
                errors.push(error);
            }
        }

        if (errors.length === 1) {
            throw errors[0];
        } else if (errors.length > 1) {
            throw new AggregateError(errors, 'Multiple errors occurred');
        }

        return [];
    } else if (arg) {
        arg.dispose();
        return arg;
    }
}

export class DisposableStore implements IDisposable {
    static DISABLE_DISPOSED_WARNING = false;

    private _isDisposed = false;
    private _toDispose = new Set<IDisposable>();

    dispose(): void {
        if (this._isDisposed) {
            return;
        }

        this._isDisposed = true;
        this.clear();
    }
    public clear(): void {
        if (this._toDispose.size === 0) {
            return;
        }

        try {
            dispose(this._toDispose);
        } finally {
            this._toDispose.clear();
        }
    }

    /**
     * Add a new {@link IDisposable disposable} to the collection.
     */
    public add<T extends IDisposable>(o: T): T {
        if ((o as unknown as DisposableStore) === this) {
            throw new Error('Cannot register a disposable on itself!');
        }

        if (this._isDisposed) {
            if (!DisposableStore.DISABLE_DISPOSED_WARNING) {
                console.warn(
                    new Error(
                        'Trying to add a disposable to a DisposableStore that has already been disposed of. The added object will be leaked!',
                    ).stack,
                );
            }
        } else {
            this._toDispose.add(o);
        }

        return o;
    }
}

export abstract class Disposable implements IDisposable {
    protected readonly _store = new DisposableStore();

    public dispose(): void {
        this._store.dispose();
    }

    protected _register<T extends IDisposable>(o: T): T {
        if ((o as unknown as Disposable) === this) {
            throw new Error('Cannot register a disposable on itself!');
        }
        return this._store.add(o);
    }
}

export function toDisposable(fn: () => void): IDisposable {
    return {
        dispose: fn,
    };
}
