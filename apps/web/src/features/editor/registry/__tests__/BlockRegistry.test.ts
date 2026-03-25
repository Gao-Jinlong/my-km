/**
 * BlockRegistry 单元测试
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { BlockCategory, BlockRegistry, type BlockTypeConfig } from '../BlockRegistry';

describe('BlockRegistry', () => {
    let registry: BlockRegistry;

    beforeEach(() => {
        registry = new BlockRegistry();
    });

    describe('register 方法', () => {
        it('应该可以注册块类型', () => {
            const config: BlockTypeConfig = {
                type: 'test-block',
                name: '测试块',
                category: BlockCategory.TEXT,
                icon: 'test',
                description: '测试块类型',
                defaultContent: () => ({ text: '' }),
                isValid: (content: Record<string, any>) => typeof content.text === 'string',
            };

            expect(() => registry.register(config)).not.toThrow();
        });

        it('应该可以注册多个块类型', () => {
            const config1: BlockTypeConfig = {
                type: 'block-1',
                name: '块 1',
                category: BlockCategory.TEXT,
                icon: 'block1',
                description: '第一个块',
                defaultContent: () => ({ text: '' }),
                isValid: (_content: Record<string, any>) => true,
            };

            const config2: BlockTypeConfig = {
                type: 'block-2',
                name: '块 2',
                category: BlockCategory.MEDIA,
                icon: 'block2',
                description: '第二个块',
                defaultContent: () => ({ src: '' }),
                isValid: (_content: Record<string, any>) => true,
            };

            registry.register(config1);
            registry.register(config2);

            expect(registry.get('block-1')).toBeDefined();
            expect(registry.get('block-2')).toBeDefined();
        });

        it('应该可以覆盖已注册的块类型', () => {
            const config1: BlockTypeConfig = {
                type: 'test',
                name: '测试块 1',
                category: BlockCategory.TEXT,
                icon: 'test1',
                description: '第一个配置',
                defaultContent: () => ({ text: '' }),
                isValid: (_content: Record<string, any>) => true,
            };

            const config2: BlockTypeConfig = {
                type: 'test',
                name: '测试块 2',
                category: BlockCategory.MEDIA,
                icon: 'test2',
                description: '第二个配置',
                defaultContent: () => ({ src: '' }),
                isValid: (_content: Record<string, any>) => true,
            };

            registry.register(config1);
            registry.register(config2);

            const result = registry.get('test');
            expect(result?.name).toBe('测试块 2');
            expect(result?.category).toBe(BlockCategory.MEDIA);
        });
    });

    describe('get 方法', () => {
        it('应该返回已注册的块类型配置', () => {
            const config: BlockTypeConfig = {
                type: 'test',
                name: '测试块',
                category: BlockCategory.TEXT,
                icon: 'test',
                description: '测试',
                defaultContent: () => ({ text: '' }),
                isValid: (_content: Record<string, any>) => true,
            };

            registry.register(config);
            const result = registry.get('test');

            expect(result).toBeDefined();
            expect(result?.name).toBe('测试块');
            expect(result?.category).toBe(BlockCategory.TEXT);
        });

        it('应该返回 undefined 对于未注册的块类型', () => {
            const result = registry.get('non-existent');
            expect(result).toBeUndefined();
        });
    });

    describe('createBlock 方法', () => {
        beforeEach(() => {
            // 注册一个测试块类型
            const config: BlockTypeConfig = {
                type: 'paragraph',
                name: '段落',
                category: BlockCategory.TEXT,
                icon: 'paragraph',
                description: '段落块',
                defaultContent: () => ({ text: '' }),
                isValid: (content: Record<string, any>) => typeof content?.text === 'string',
            };
            registry.register(config);
        });

        it('应该创建块实例', () => {
            const block = registry.createBlock('paragraph');

            expect(block).not.toBeNull();
            expect(block?.id).toMatch(/^block-[a-z0-9]+$/);
            expect(block?.type).toBe('paragraph');
            expect(block?.content).toEqual({ text: '' });
        });

        it('应该使用自定义内容创建块', () => {
            const block = registry.createBlock('paragraph', { text: 'Hello World' });

            expect(block).not.toBeNull();
            expect(block?.content).toEqual({ text: 'Hello World' });
        });

        it('应该返回 null 对于未注册的块类型', () => {
            const block = registry.createBlock('non-existent');
            expect(block).toBeNull();
        });

        it('应该返回 null 对于无效内容', () => {
            const block = registry.createBlock('paragraph', { text: 123 });
            expect(block).toBeNull();
        });

        it('应该生成唯一的块 ID', () => {
            const block1 = registry.createBlock('paragraph');
            const block2 = registry.createBlock('paragraph');

            expect(block1?.id).not.toBe(block2?.id);
        });
    });

    describe('validateBlock 方法', () => {
        beforeEach(() => {
            const config: BlockTypeConfig = {
                type: 'heading',
                name: '标题',
                category: BlockCategory.TEXT,
                icon: 'heading',
                description: '标题块',
                defaultContent: () => ({ text: '', level: 1 }),
                isValid: (content: Record<string, any>) => {
                    return (
                        typeof content?.text === 'string' &&
                        [1, 2, 3, 4, 5, 6].includes(content?.level)
                    );
                },
            };
            registry.register(config);
        });

        it('应该验证有效的块内容', () => {
            const valid = registry.validateBlock('heading', { text: 'Title', level: 2 });
            expect(valid).toBe(true);
        });

        it('应该验证无效的块内容', () => {
            const invalid1 = registry.validateBlock('heading', { text: 'Title', level: 7 });
            expect(invalid1).toBe(false);

            const invalid2 = registry.validateBlock('heading', { text: 123, level: 1 });
            expect(invalid2).toBe(false);
        });

        it('应该返回 false 对于未注册的块类型', () => {
            const valid = registry.validateBlock('non-existent', { text: 'test' });
            expect(valid).toBe(false);
        });
    });

    describe('getAllTypes 方法', () => {
        it('应该返回所有注册的块类型', () => {
            registry.register({
                type: 'type-1',
                name: '类型 1',
                category: BlockCategory.TEXT,
                icon: 'icon1',
                description: '描述 1',
                defaultContent: () => ({}),
                isValid: () => true,
            });

            registry.register({
                type: 'type-2',
                name: '类型 2',
                category: BlockCategory.MEDIA,
                icon: 'icon2',
                description: '描述 2',
                defaultContent: () => ({}),
                isValid: () => true,
            });

            const types = registry.getAllTypes();

            expect(types).toHaveLength(2);
            expect(types).toContain('type-1');
            expect(types).toContain('type-2');
        });

        it('空注册时应该返回空数组', () => {
            const types = registry.getAllTypes();
            expect(types).toEqual([]);
        });
    });

    describe('getByCategory 方法', () => {
        beforeEach(() => {
            registry.register({
                type: 'text-block',
                name: '文本块',
                category: BlockCategory.TEXT,
                icon: 'text',
                description: '文本块',
                defaultContent: () => ({ text: '' }),
                isValid: () => true,
            });

            registry.register({
                type: 'media-block',
                name: '媒体块',
                category: BlockCategory.MEDIA,
                icon: 'media',
                description: '媒体块',
                defaultContent: () => ({ src: '' }),
                isValid: () => true,
            });

            registry.register({
                type: 'structure-block',
                name: '结构块',
                category: BlockCategory.STRUCTURE,
                icon: 'structure',
                description: '结构块',
                defaultContent: () => ({ items: [] }),
                isValid: () => true,
            });
        });

        it('应该返回指定类别的所有块类型', () => {
            const textTypes = registry.getByCategory(BlockCategory.TEXT);
            expect(textTypes).toHaveLength(1);
            expect(textTypes).toContain('text-block');

            const mediaTypes = registry.getByCategory(BlockCategory.MEDIA);
            expect(mediaTypes).toHaveLength(1);
            expect(mediaTypes).toContain('media-block');

            const structureTypes = registry.getByCategory(BlockCategory.STRUCTURE);
            expect(structureTypes).toHaveLength(1);
            expect(structureTypes).toContain('structure-block');
        });

        it('应该返回空数组对于没有块类型的类别', () => {
            // 注册一个新的 TEXT 块后，再获取 TEXT 类别
            const allTypes = registry.getAllTypes();
            expect(allTypes).toHaveLength(3);
        });
    });

    describe('BlockCategory 枚举', () => {
        it('应该包含正确的类别值', () => {
            expect(BlockCategory.TEXT).toBe('text');
            expect(BlockCategory.MEDIA).toBe('media');
            expect(BlockCategory.STRUCTURE).toBe('structure');
        });
    });
});

describe('blockRegistry 单例', () => {
    it('应该导出单例实例', () => {
        // blockRegistry 已经在 BlockRegistry.ts 中导出
        const registryInstance = new BlockRegistry();
        expect(registryInstance).toBeDefined();
        expect(registryInstance).toBeInstanceOf(BlockRegistry);
    });
});
