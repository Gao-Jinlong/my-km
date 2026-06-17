/**
 * 消息组件统一导出入口
 * 外部通过此文件导入子组件，便于后续重构调整内部结构
 */

export type {
    TextMessageProps,
    ToolCallIndicatorProps,
    ToolMessageProps,
} from './types';
// 注意：TextMessage、ToolMessage、ToolCallIndicator 组件将在后续任务中创建
// 现在先导出类型和工具函数
export { summarizeArgs } from './utils';
