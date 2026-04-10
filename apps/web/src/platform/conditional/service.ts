/**
 * ConditionalService - 条件服务
 *
 * 用于评估快捷键、菜单项、按钮等操作的执行条件
 * 提供条件注册、评估、上下文管理功能
 *
 * @example
 * ```typescript
 * const conditionalService = container.get(ConditionalService);
 *
 * // 注册条件
 * conditionalService.register({
 *     id: 'isFilePanelActive',
 *     description: '文件面板处于激活状态',
 *     evaluate: () => panelService.getExpandedPanelId() === 'files-panel',
 * });
 *
 * // 评估条件
 * if (conditionalService.evaluate('isFilePanelActive')) {
 *     // 执行文件面板相关的操作
 * }
 *
 * // 更新上下文
 * conditionalService.updateContext({ activePanelId: 'files-panel' });
 * ```
 */

import { ServiceBase } from '@/platform/base/service-base';
import { container } from '@/platform/bootstrap';
import { Service } from '@/platform/di';
import { LoggerService } from '@/platform/logger/service';
import type {
    ConditionConfig,
    ConditionContext,
    ConditionEvaluator,
    ConditionId,
    IConditionalService,
    IDisposable,
} from './types';

@Service({ singleton: true })
export class ConditionalService extends ServiceBase implements IConditionalService {
    private readonly logger = container.get(LoggerService).getLogger('conditional');

    /** 条件注册表 */
    private readonly conditions = new Map<string, ConditionEvaluator>();

    /** 当前上下文 */
    private context: ConditionContext = {};

    /**
     * 注册条件评估器
     *
     * @param config 条件配置
     * @returns IDisposable 用于注销条件
     *
     * @example
     * ```typescript
     * conditionalService.register({
     *     id: 'isEditorActive',
     *     description: '编辑器处于激活状态',
     *     evaluate: (ctx) => ctx?.activeDocumentId !== null,
     * });
     * ```
     */
    register(config: ConditionConfig): IDisposable {
        const { id, description, evaluate } = config;

        if (this.conditions.has(id)) {
            this.logger.warn(`条件 "${id}" 已被注册，正在覆盖`);
        }

        const evaluator: ConditionEvaluator = {
            id,
            description,
            evaluate,
        };

        this.conditions.set(id, evaluator);

        return {
            dispose: () => {
                this.conditions.delete(id);
            },
        };
    }

    /**
     * 评估条件
     *
     * @param conditionId 条件 ID
     * @param context 条件上下文（可选，会合并到当前上下文）
     * @returns 是否满足条件
     *
     * @example
     * ```typescript
     * // 使用当前上下文评估
     * const canSearch = conditionalService.evaluate('isFilePanelActive');
     *
     * // 使用临时上下文评估
     * const canSave = conditionalService.evaluate('isEditorActive', {
     *     activeDocumentId: 'doc-123',
     * });
     * ```
     */
    evaluate(conditionId: ConditionId | string, context?: ConditionContext): boolean {
        const evaluator = this.conditions.get(conditionId);

        if (!evaluator) {
            this.logger.warn(`条件 "${conditionId}" 未注册，返回 false`);
            return false;
        }

        // 合并上下文：当前上下文 + 临时上下文
        const mergedContext = context ? { ...this.context, ...context } : this.context;

        try {
            return evaluator.evaluate(mergedContext);
        } catch (error) {
            this.logger.error(`条件 "${conditionId}" 评估失败:`, error);
            return false;
        }
    }

    /**
     * 检查条件是否已注册
     */
    has(conditionId: ConditionId | string): boolean {
        return this.conditions.has(conditionId);
    }

    /**
     * 获取所有已注册的条件
     */
    getAll(): ConditionEvaluator[] {
        return Array.from(this.conditions.values());
    }

    /**
     * 更新条件上下文
     *
     * @param context 新的上下文（合并到当前上下文）
     *
     * @example
     * ```typescript
     * // 当面板变化时更新上下文
     * panelService.onDidChangePanel(state => {
     *     conditionalService.updateContext({ activePanelId: state.id });
     * });
     * ```
     */
    updateContext(context: Partial<ConditionContext>): void {
        this.context = { ...this.context, ...context };
    }

    /**
     * 获取当前上下文
     */
    getContext(): ConditionContext {
        return { ...this.context };
    }

    /**
     * 批量注册条件
     *
     * @param configs 条件配置数组
     * @returns IDisposable 用于注销所有条件
     */
    registerBatch(configs: ConditionConfig[]): IDisposable {
        const disposables: IDisposable[] = [];

        for (const config of configs) {
            disposables.push(this.register(config));
        }

        return {
            dispose: () => {
                for (const d of disposables) {
                    d.dispose();
                }
            },
        };
    }

    override dispose(): void {
        this.conditions.clear();
        this.context = {};
        super.dispose();
    }
}
