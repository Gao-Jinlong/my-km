// apps/web/src/platform/command/__tests__/service.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CommandService } from '../service';

describe('CommandService', () => {
    let commandService: CommandService;

    beforeEach(() => {
        commandService = new CommandService();
    });

    afterEach(() => {
        commandService.dispose();
    });

    it('应成功注册命令', () => {
        const handler = vi.fn();
        const disposable = commandService.registerCommand({
            id: 'test.cmd',
            handler,
        });

        expect(commandService.hasCommand('test.cmd')).toBe(true);
        disposable.dispose();
        expect(commandService.hasCommand('test.cmd')).toBe(false);
    });

    it('应执行命令', async () => {
        const handler = vi.fn().mockResolvedValue({ success: true });
        commandService.registerCommand({
            id: 'test.cmd',
            handler,
        });

        const result = await commandService.executeCommand('test.cmd', 'arg1');

        expect(handler).toHaveBeenCalledWith(
            expect.objectContaining({
                commandId: 'test.cmd',
                args: ['arg1'],
            }),
        );
        expect(result).toEqual({ success: true });
    });

    it('应支持命令拦截器', async () => {
        const beforeMock = vi.fn(() => true);
        const afterMock = vi.fn();

        commandService.addInterceptor({
            before: beforeMock,
            after: afterMock,
        });

        commandService.registerCommand({
            id: 'test.cmd',
            handler: vi.fn(),
        });

        await commandService.executeCommand('test.cmd');

        expect(beforeMock).toHaveBeenCalled();
        expect(afterMock).toHaveBeenCalled();
    });

    it('应支持拦截器取消执行', async () => {
        commandService.addInterceptor({
            before: () => false,
            priority: 100,
        });

        const handler = vi.fn();
        commandService.registerCommand({
            id: 'test.cmd',
            handler,
        });

        const result = await commandService.executeCommand('test.cmd');

        expect(handler).not.toHaveBeenCalled();
        expect(result).toBeUndefined();
    });

    it('应记录命令历史', async () => {
        commandService.registerCommand({
            id: 'test.cmd',
            handler: vi.fn(),
        });

        await commandService.executeCommand('test.cmd', 'arg1');

        const history = commandService.getHistory();
        expect(history).toHaveLength(1);
        expect(history[0].commandId).toBe('test.cmd');
        expect(history[0].args).toEqual(['arg1']);
    });

    it('应触发即将执行事件', async () => {
        const onWillExecute = vi.fn();
        commandService.onWillExecuteCommand(onWillExecute);

        commandService.registerCommand({
            id: 'test.cmd',
            handler: vi.fn(),
        });

        await commandService.executeCommand('test.cmd');

        expect(onWillExecute).toHaveBeenCalledWith(
            expect.objectContaining({
                context: expect.objectContaining({
                    commandId: 'test.cmd',
                }),
            }),
        );
    });

    it('应触发已执行事件', async () => {
        const onDidExecute = vi.fn();
        commandService.onDidExecuteCommand(onDidExecute);

        commandService.registerCommand({
            id: 'test.cmd',
            handler: vi.fn().mockResolvedValue({ result: 'ok' }),
        });

        await commandService.executeCommand('test.cmd');

        expect(onDidExecute).toHaveBeenCalledWith(
            expect.objectContaining({
                result: { result: 'ok' },
            }),
        );
    });

    it('应触发失败事件', async () => {
        const onFailed = vi.fn();
        commandService.onCommandFailed(onFailed);

        commandService.registerCommand({
            id: 'test.cmd',
            handler: vi.fn().mockRejectedValue(new Error('Test error')),
        });

        await expect(commandService.executeCommand('test.cmd')).rejects.toThrow('Test error');

        expect(onFailed).toHaveBeenCalledWith(
            expect.objectContaining({
                error: expect.any(Error),
            }),
        );
    });

    it('应获取所有命令', () => {
        commandService.registerCommand({ id: 'cmd1', label: 'Command 1', category: 'Test' });
        commandService.registerCommand({ id: 'cmd2', label: 'Command 2', category: 'Test' });

        const commands = commandService.getAllCommands();
        expect(commands).toHaveLength(2);
        expect(commands.map(c => c.id)).toContain('cmd1');
        expect(commands.map(c => c.id)).toContain('cmd2');
    });

    it('应获取最近执行的命令', async () => {
        commandService.registerCommand({
            id: 'test.cmd',
            handler: vi.fn(),
        });

        await commandService.executeCommand('test.cmd');

        const last = commandService.getLastExecuted();
        expect(last).not.toBeNull();
        expect(last?.commandId).toBe('test.cmd');
    });

    it('应抛出错误对于未注册命令', async () => {
        await expect(commandService.executeCommand('nonexistent')).rejects.toThrow('命令未找到');
    });
});
