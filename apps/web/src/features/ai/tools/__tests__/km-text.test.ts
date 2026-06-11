import { describe, expect, it } from 'vitest';
import { kmFileToPlainText } from '../km-text';

describe('kmFileToPlainText', () => {
    it('应该把 .km 文件的段落 blocks 转换为多行纯文本', () => {
        const raw = JSON.stringify({
            metadata: { version: '1.0.0', createdAt: '', updatedAt: '' },
            content: [
                { type: 'paragraph', content: { inline: [{ text: 'Hello ' }, { text: 'World' }] } },
                { type: 'paragraph', content: { inline: [{ text: 'Second line' }] } },
            ],
        });

        expect(kmFileToPlainText(raw)).toBe('Hello World\nSecond line');
    });

    it('应该处理 heading、quote、code 等 block 类型', () => {
        const raw = JSON.stringify({
            metadata: { version: '1.0.0', createdAt: '', updatedAt: '' },
            content: [
                { type: 'heading', content: { inline: [{ text: 'Title' }] } },
                { type: 'quote', content: { inline: [{ text: 'Quoted' }] } },
                { type: 'code', content: { code: 'const x = 1;' } },
            ],
        });

        expect(kmFileToPlainText(raw)).toBe('Title\nQuoted\nconst x = 1;');
    });

    it('应该把 list 的每个 item 转为单独的行', () => {
        const raw = JSON.stringify({
            metadata: { version: '1.0.0', createdAt: '', updatedAt: '' },
            content: [
                {
                    type: 'list',
                    content: {
                        items: [{ inline: [{ text: 'Item 1' }] }, { inline: [{ text: 'Item 2' }] }],
                    },
                },
            ],
        });

        expect(kmFileToPlainText(raw)).toBe('Item 1\nItem 2');
    });

    it('空文件应返回空字符串', () => {
        expect(kmFileToPlainText('')).toBe('');
    });

    it('无效 JSON 应抛出错误', () => {
        expect(() => kmFileToPlainText('not json')).toThrow(/Invalid .km file/);
    });
});
