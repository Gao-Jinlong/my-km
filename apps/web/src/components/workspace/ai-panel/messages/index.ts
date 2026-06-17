/**
 * 消息组件统一导出入口
 * 外部通过此文件导入子组件，便于后续重构调整内部结构
 */

export { ToolCallIndicator } from './ToolCallIndicator';
export type {
    TextMessageProps,
    ToolCallIndicatorProps,
    ToolMessageProps,
} from './types';
export { summarizeArgs } from './utils';
