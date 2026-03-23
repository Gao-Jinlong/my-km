import { describe, expect, it } from 'vitest';
import { FileSystemCapability } from '../types';

describe('capability utils', () => {
    describe('hasCapability', () => {
        it('应该检查单一能力 - Read', () => {
            expect(hasCapability(FileSystemCapability.Read, FileSystemCapability.Read)).toBe(true);
        });

        it('应该检查组合能力 - FullAccess 包含 Read', () => {
            expect(hasCapability(FileSystemCapability.FullAccess, FileSystemCapability.Read)).toBe(
                true,
            );
        });

        it('应该检查不足的能力 - Read 不包含 Write', () => {
            expect(hasCapability(FileSystemCapability.Read, FileSystemCapability.Write)).toBe(
                false,
            );
        });

        it('应该检查组合能力 - ReadWrite 包含 Read 和 Write', () => {
            const caps = FileSystemCapability.Read | FileSystemCapability.Write;
            expect(hasCapability(caps, FileSystemCapability.Read)).toBe(true);
            expect(hasCapability(caps, FileSystemCapability.Write)).toBe(true);
        });

        it('应该检查 None 能力', () => {
            expect(hasCapability(FileSystemCapability.None, FileSystemCapability.Read)).toBe(false);
        });
    });

    describe('combineCapabilities', () => {
        it('应该组合两个能力', () => {
            expect(combineCapabilities(FileSystemCapability.Read, FileSystemCapability.Write)).toBe(
                3,
            );
        });

        it('应该组合多个能力', () => {
            expect(
                combineCapabilities(
                    FileSystemCapability.Read,
                    FileSystemCapability.Write,
                    FileSystemCapability.List,
                    FileSystemCapability.Metadata,
                ),
            ).toBe(15);
        });

        it('应该处理零个能力', () => {
            expect(combineCapabilities()).toBe(0);
        });

        it('应该处理单个能力', () => {
            expect(combineCapabilities(FileSystemCapability.Read)).toBe(1);
        });
    });

    describe('removeCapability', () => {
        it('应该移除单一能力', () => {
            expect(removeCapability(15, FileSystemCapability.Write)).toBe(13);
        });

        it('应该移除多个能力', () => {
            expect(
                removeCapability(15, FileSystemCapability.Read | FileSystemCapability.Write),
            ).toBe(12);
        });

        it('应该处理移除不存在的能力', () => {
            expect(removeCapability(1, FileSystemCapability.Write)).toBe(1);
        });
    });

    describe('getCapabilityNames', () => {
        it('应该获取 FullAccess 的能力名称', () => {
            const names = getCapabilityNames(FileSystemCapability.FullAccess);
            expect(names).toEqual(['Read', 'Write', 'List', 'Metadata']);
        });

        it('应该获取 Read 的能力名称', () => {
            const names = getCapabilityNames(FileSystemCapability.Read);
            expect(names).toEqual(['Read']);
        });

        it('应该获取 None 的能力名称', () => {
            const names = getCapabilityNames(FileSystemCapability.None);
            expect(names).toEqual(['None']);
        });

        it('应该获取组合能力名称', () => {
            const names = getCapabilityNames(
                FileSystemCapability.Read | FileSystemCapability.Metadata,
            );
            expect(names).toEqual(['Read', 'Metadata']);
        });
    });

    describe('getCapabilityMode', () => {
        it('应该获取 ReadOnly 模式', () => {
            expect(getCapabilityMode('ReadOnly')).toBe(9);
        });

        it('应该获取 ReadWrite 模式', () => {
            expect(getCapabilityMode('ReadWrite')).toBe(11);
        });

        it('应该获取 FullAccess 模式', () => {
            expect(getCapabilityMode('FullAccess')).toBe(15);
        });
    });

    describe('isCapabilityMode', () => {
        it('应该识别 ReadOnly 模式', () => {
            expect(isCapabilityMode(9, 'ReadOnly')).toBe(true);
            expect(isCapabilityMode(10, 'ReadOnly')).toBe(false);
        });

        it('应该识别 ReadWrite 模式', () => {
            expect(isCapabilityMode(11, 'ReadWrite')).toBe(true);
        });

        it('应该识别 FullAccess 模式', () => {
            expect(isCapabilityMode(15, 'FullAccess')).toBe(true);
        });
    });
});
