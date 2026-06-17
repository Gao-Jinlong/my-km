/**
 * 用户消息组件
 *
 * 展示人类用户发送的消息。
 * 右对齐，使用 accent 色作为背景。
 *
 * 扩展点：未来支持用户消息内的附件、图片等
 */

import type { HumanMessageProps } from './types';

export function HumanMessage({ message }: HumanMessageProps) {
    return (
        <div className="flex justify-end">
            <div className="max-w-[85%] rounded-lg bg-ws-accent px-3 py-2 text-[13px] text-white leading-relaxed">
                <div className="whitespace-pre-wrap break-words">{message.content}</div>
            </div>
        </div>
    );
}
