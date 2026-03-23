import { FileSystemCapability, FileSystemCapabilityMode } from '../types';

/**
 * 检查是否具备所需能力
 *
 * @param capabilities - 当前能力位掩码
 * @param required - 所需能力位掩码
 * @returns 是否具备所需能力
 *
 * @example
 * hasCapability(15, 1) // true - FullAccess 包含 Read
 * hasCapability(1, 2) // false - Read 不包含 Write
 */
export function hasCapability(capabilities: number, required: number): boolean {
    return (capabilities & required) === required;
}

/**
 * 组合多个能力
 *
 * @param caps - 要组合的能力列表
 * @returns 组合后的能力位掩码
 *
 * @example
 * combineCapabilities(1, 2) // 3 - Read | Write
 * combineCapabilities(1, 2, 4, 8) // 15 - FullAccess
 */
export function combineCapabilities(...caps: number[]): number {
    if (caps.length === 0) {
        return FileSystemCapability.None;
    }

    return caps.reduce((acc, cap) => acc | cap, 0);
}

/**
 * 移除能力
 *
 * @param capabilities - 当前能力位掩码
 * @param toRemove - 要移除的能力位掩码
 * @returns 移除后的能力位掩码
 *
 * @example
 * removeCapability(15, 2) // 13 - FullAccess 移除 Write
 */
export function removeCapability(capabilities: number, toRemove: number): number {
    return capabilities & ~toRemove;
}

/**
 * 获取能力的字符串表示
 *
 * @param capability - 能力位掩码
 * @returns 能力名称列表
 *
 * @example
 * getCapabilityNames(15) // ['Read', 'Write', 'List', 'Metadata']
 */
export function getCapabilityNames(capability: number): string[] {
    const names: string[] = [];

    if (capability & FileSystemCapability.Read) {
        names.push('Read');
    }
    if (capability & FileSystemCapability.Write) {
        names.push('Write');
    }
    if (capability & FileSystemCapability.List) {
        names.push('List');
    }
    if (capability & FileSystemCapability.Metadata) {
        names.push('Metadata');
    }

    if (names.length === 0) {
        names.push('None');
    }

    return names;
}

/**
 * 获取预设能力模式
 *
 * @param mode - 模式名称
 * @returns 能力位掩码
 */
export function getCapabilityMode(mode: keyof typeof FileSystemCapabilityMode): number {
    return FileSystemCapabilityMode[mode];
}

/**
 * 检查能力是否匹配预设模式
 *
 * @param capabilities - 当前能力位掩码
 * @param mode - 预设模式
 * @returns 是否匹配
 */
export function isCapabilityMode(
    capabilities: number,
    mode: keyof typeof FileSystemCapabilityMode,
): boolean {
    return capabilities === FileSystemCapabilityMode[mode];
}
