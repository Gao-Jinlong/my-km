/**
 * 类型测试文件
 * 用于验证类型定义的完整性和正确性
 */

import { describe, expect, it } from 'vitest';
import type { Document, HeadingBlock, Inline, ListBlock, ParagraphBlock } from '../index';

describe('Editor Types', () => {
    it('should define Inline type correctly', () => {
        const inlineBold: Inline = {
            text: 'bold text',
            bold: true,
        };

        expect(inlineBold.text).toBe('bold text');
        expect(inlineBold.bold).toBe(true);
    });

    it('should define ParagraphBlock with inline content', () => {
        const paragraphBlock: ParagraphBlock = {
            id: 'block-para1',
            type: 'paragraph',
            content: {
                inline: [
                    { text: 'Hello ', bold: false },
                    { text: 'World', bold: true },
                ],
            },
        };

        expect(paragraphBlock.content.inline).toHaveLength(2);
        expect(paragraphBlock.content.inline[1].bold).toBe(true);
    });

    it('should define HeadingBlock with inline content', () => {
        const headingBlock: HeadingBlock = {
            id: 'block-head1',
            type: 'heading',
            content: {
                inline: [{ text: '这是一个标题' }],
                level: 1,
            },
        };

        expect(headingBlock.content.level).toBe(1);
    });

    it('should define ListBlock with inline items', () => {
        const listBlock: ListBlock = {
            id: 'block-list1',
            type: 'list',
            content: {
                items: [
                    { id: 'item-1', inline: [{ text: '项目 1' }] },
                    { id: 'item-2', inline: [{ text: '项目 2' }], checked: true },
                ],
                listType: 'bullet',
            },
        };

        expect(listBlock.content.items).toHaveLength(2);
        expect(listBlock.content.items[1].checked).toBe(true);
    });

    it('should define Document with Block[] content', () => {
        const testDocument: Document = {
            id: 'doc-test123',
            path: '/documents/test.md',
            title: '测试文档',
            type: 'markdown',
            content: [],
            version: 1,
            createdAt: '2026-03-25T10:00:00Z',
            updatedAt: '2026-03-25T10:00:00Z',
            operations: [],
        };

        expect(testDocument.content).toEqual([]);
        expect(testDocument.type).toBe('markdown');
    });
});
