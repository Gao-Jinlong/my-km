/**
 * 对话框服务
 *
 * 替代浏览器原生 prompt/alert/confirm，提供自定义对话框 UI
 */

import { Emitter } from '@/base/common/event';
import { ServiceBase } from '@/platform/base/service-base';
import { Service } from '@/platform/di';
import type { DialogRequest } from './types';

@Service({ singleton: true })
export class DialogService extends ServiceBase {
    private readonly _onDidRequestDialog = new Emitter<DialogRequest>();
    readonly onDidRequestDialog = this._onDidRequestDialog.event;

    private readonly _onDidDismissDialog = new Emitter<string>();
    readonly onDidDismissDialog = this._onDidDismissDialog.event;

    private _counter = 0;

    /**
     * 弹出输入框对话框
     *
     * @param title 对话框标题
     * @param defaultValue 输入框默认值
     * @returns 用户输入的值，取消时返回 null
     */
    askText(title: string, defaultValue?: string): Promise<string | null> {
        const { request, promise } = this.createRequest('input', title, undefined, defaultValue);
        this._onDidRequestDialog.fire(request);
        return promise;
    }

    /**
     * 弹出确认对话框
     *
     * @param message 确认消息
     * @returns 用户点击确定返回 true，取消返回 false
     */
    confirm(message: string): Promise<boolean> {
        const { request, promise } = this.createRequest('confirm', '确认', message);
        this._onDidRequestDialog.fire(request);
        return promise;
    }

    /**
     * 弹出提示对话框
     *
     * @param message 提示消息
     * @returns 用户关闭对话框后 resolve
     */
    alert(message: string): Promise<void> {
        const { request, promise } = this.createRequest('alert', '提示', message);
        this._onDidRequestDialog.fire(request);
        return promise;
    }

    /**
     * 关闭指定对话框
     *
     * @param id 对话框 ID
     */
    dismiss(id: string): void {
        this._onDidDismissDialog.fire(id);
    }

    private createRequest(
        type: DialogRequest['type'],
        title: string,
        message?: string,
        defaultValue?: string,
    ): { request: DialogRequest; promise: Promise<string | boolean | null | undefined> } {
        const id = `dialog-${++this._counter}`;

        let resolveFn: (value: string | boolean | null | undefined) => void;
        const promise = new Promise<string | boolean | null | undefined>(r => {
            resolveFn = r;
        });

        const request: DialogRequest = {
            id,
            type,
            title,
            message,
            defaultValue,
            resolve: resolveFn as (value: string | boolean | null | undefined) => void,
        };

        return { request, promise };
    }

    override dispose(): void {
        this._onDidRequestDialog.dispose();
        this._onDidDismissDialog.dispose();
        super.dispose();
    }
}
