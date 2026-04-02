/**
 * ConditionalService - 条件服务类型定义
 *
 * 用于评估快捷键、菜单项、按钮等操作的执行条件
 */

/**
 * 条件 ID 枚举
 *
 * 预定义的条件 ID，用于类型安全的条件引用
 */
export enum ConditionId {
    /** 文件面板处于激活且展开状态 */
    IS_FILE_PANEL_ACTIVE = 'isFilePanelActive',
    /** 搜索面板处于激活且展开状态 */
    IS_SEARCH_PANEL_ACTIVE = 'isSearchPanelActive',
    /** 编辑器有激活的文档 */
    IS_EDITOR_ACTIVE = 'isEditorActive',
    /** 焦点在输入元素中（input/textarea/textbox） */
    IS_IN_INPUT = 'isInInput',
}

/**
 * 条件上下文
 *
 * 包含评估条件时可能需要的所有上下文信息
 */
export interface ConditionContext {
    /** 当前激活的面板 ID */
    activePanelId?: string | null;
    /** 当前激活的文档 ID */
    activeDocumentId?: string | null;
    /** 焦点元素标签名 */
    focusElementTagName?: string;
    /** 是否在输入元素中（input/textarea） */
    isInInput?: boolean;
    /** 自定义上下文数据 */
    [key: string]: unknown;
}

/**
 * 条件评估器接口
 *
 * 用于实现具体的条件判断逻辑
 */
export interface ConditionEvaluator {
    /** 条件唯一标识 */
    id: string;
    /** 条件描述 */
    description?: string;
    /**
     * 评估函数
     * @param context 条件上下文
     * @returns 是否满足条件
     */
    evaluate: (context?: ConditionContext) => boolean;
}

/**
 * 条件评估函数类型
 */
export type ConditionFn = (context?: ConditionContext) => boolean;

/**
 * 条件配置
 */
export interface ConditionConfig {
    /** 条件唯一标识，推荐使用 ConditionId 枚举 */
    id: ConditionId | string;
    /** 条件描述 */
    description?: string;
    /** 评估函数 */
    evaluate: ConditionFn;
}

/**
 * 条件服务接口
 */
export interface IConditionalService {
    /**
     * 注册条件评估器
     * @param config 条件配置
     * @returns 注销函数
     */
    register(config: ConditionConfig): IDisposable;

    /**
     * 评估条件
     * @param conditionId 条件 ID，推荐使用 ConditionId 枚举
     * @param context 条件上下文（可选）
     * @returns 是否满足条件
     */
    evaluate(conditionId: ConditionId | string, context?: ConditionContext): boolean;

    /**
     * 检查条件是否已注册
     */
    has(conditionId: ConditionId | string): boolean;

    /**
     * 获取所有已注册的条件
     */
    getAll(): ConditionEvaluator[];

    /**
     * 更新条件上下文
     * @param context 新的上下文
     */
    updateContext(context: Partial<ConditionContext>): void;

    /**
     * 获取当前上下文
     */
    getContext(): ConditionContext;
}

/**
 * 资源释放接口
 */
export interface IDisposable {
    dispose: () => void;
}
