/**
 * 服务基础类
 *
 * 所有服务都应继承此类，以获得统一的资源管理和生命周期
 */

import { Emitter } from '../../base/common/event';
import { Disposable, DisposableStore } from '../../base/common/lifecycle';

/**
 * 服务基类
 *
 * 提供：
 * - 统一的 dispose 模式
 * - 资源管理（DisposableStore）
 * - 事件发射器基类
 *
 * @example
 * ```typescript
 * @Service({ singleton: true })
 * class MyService extends ServiceBase {
 *     private readonly _onStateChange = new Emitter<string>();
 *     readonly onStateChange = this._onStateChange.event;
 *
 *     doWork() {
 *         this._onStateChange.fire('working');
 *     }
 *
 *     override dispose(): void {
 *         this._onStateChange.dispose();
 *         super.dispose();
 *     }
 * }
 * ```
 */
export abstract class ServiceBase extends Disposable {
    /**
     * 资源管理器
     *
     * 所有注册的资源会在 dispose 时自动释放
     */
    protected readonly _store = new DisposableStore();

    /**
     * 服务是否已销毁
     */
    protected _isDisposed = false;

    /**
     * 销毁事件
     */
    protected readonly _onDispose = new Emitter<void>();
    readonly onDispose = this._onDispose.event;

    override dispose(): void {
        if (this._isDisposed) {
            return;
        }

        this._isDisposed = true;
        this._onDispose.fire();
        this._onDispose.dispose();
        this._store.dispose();
        super.dispose();
    }
}
