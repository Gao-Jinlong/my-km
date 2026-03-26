// apps/web/src/platform/command/__tests__/types.test.ts
import { describe, expect, it } from 'vitest';
import type {
    CommandContext,
    CommandDefinition,
    CommandHistoryItem,
    CommandInterceptor,
} from '../types';

describe('CommandService Types', () => {
    it('应正确定义命令上下文', () => {
        const context: CommandContext = {
            commandId: 'file.save',
            args: ['/path/to/file'],
            source: 'menu',
        };
        expect(context.commandId).toBe('file.save');
        expect(context.source).toBe('menu');
    });

    it('应正确定义命令定义', () => {
        const def: CommandDefinition = {
            id: 'file.save',
            label: '保存文件',
            category: '文件',
            description: '保存当前文件',
            shortcut: 'Ctrl+S',
            handler: async ctx => {
                console.log('Saving...', ctx.args);
                return { success: true };
            },
        };
        expect(def.id).toBe('file.save');
        expect(def.label).toBe('保存文件');
    });

    it('应正确定义拦截器', () => {
        const interceptor: CommandInterceptor = {
            before: async ctx => {
                console.log('Before:', ctx.commandId);
                return true;
            },
            after: (ctx, result) => {
                console.log('After:', result);
            },
            onError: (ctx, error) => {
                console.error('Error:', error);
            },
            priority: 0,
        };
        expect(interceptor.priority).toBe(0);
    });

    it('应正确定义历史项', () => {
        const history: CommandHistoryItem = {
            commandId: 'file.save',
            timestamp: Date.now(),
            args: ['/path'],
            source: 'menu',
            result: { success: true },
            duration: 50,
        };
        expect(history.commandId).toBe('file.save');
        expect(history.duration).toBe(50);
    });
});
