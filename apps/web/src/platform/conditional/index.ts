/**
 * Conditional Service - 条件服务
 *
 * 用于评估快捷键、菜单项、按钮等操作的执行条件
 */

export { ConditionalService } from './service';
export { registerConditionEvaluators } from './evaluators';
export { ConditionId } from './types';
export type {
    ConditionConfig,
    ConditionContext,
    ConditionEvaluator,
    ConditionFn,
    IConditionalService,
    IDisposable,
} from './types';
