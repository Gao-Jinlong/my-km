/**
 * Snapshot 工具函数
 *
 * 为 per-run 快照提供深克隆 + 冻结语义：
 * - structuredClone: 创建值的深拷贝，断开外部引用
 * - deepFreeze: 递归冻结对象，防止运行时修改
 *
 * 约束：
 * - 输入值应为 JSON-like 数据（plain object/array/primitive）
 * - 不支持函数、class instance、Symbol 等不可克隆对象
 */

/**
 * 递归冻结对象（不可变快照）
 */
export function deepFreeze<T>(value: T): Readonly<T> {
    if (value === null || typeof value !== 'object') {
        return value;
    }

    if (Array.isArray(value)) {
        Object.freeze(value);
        for (const item of value) {
            deepFreeze(item);
        }
        return value as Readonly<T>;
    }

    // Plain object
    Object.freeze(value);
    for (const val of Object.values(value as Record<string, unknown>)) {
        deepFreeze(val);
    }
    return value;
}

/**
 * 创建值的不可变快照
 *
 * 1. structuredClone → 深拷贝（断开外部引用）
 * 2. deepFreeze → 运行时不可修改
 *
 * 如果值包含不可克隆对象（函数、class instance 等），
 * structuredClone 会抛出 DataCloneError。
 */
export function snapshotValue<T>(value: T): Readonly<T> {
    return deepFreeze(structuredClone(value));
}
