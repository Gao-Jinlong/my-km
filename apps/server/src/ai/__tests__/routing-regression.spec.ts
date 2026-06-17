/**
 * 路由冲突回归测试
 *
 * 确保 cancel 路由（POST threads/:threadId/runs/:runId/cancel）只在 controller 中
 * 注册一次。历史上 ThreadsController 和 RunsController 各注册一次，导致 NestJS
 * 注册顺序决定哪个生效。
 *
 * 方式：静态扫描 ai/ 下所有 controller 文件，统计 cancel 装饰器出现次数。
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

function listControllerFiles(dir: string, acc: string[] = []): string[] {
    for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) {
            listControllerFiles(full, acc);
        } else if (entry.endsWith('.controller.ts')) {
            acc.push(full);
        }
    }
    return acc;
}

describe('AI routing regression', () => {
    const aiSrc = resolve(__dirname, '..');
    const controllers = listControllerFiles(aiSrc);

    it('covers both thread and run controllers', () => {
        const normalized = controllers.map(c => c.replace(/\\/g, '/'));
        expect(normalized).toEqual(
            expect.arrayContaining([
                expect.stringContaining('thread/threads.controller.ts'),
                expect.stringContaining('run/runs.controller.ts'),
            ]),
        );
    });

    it('registers cancel route exactly once across all controllers', () => {
        const cancelRegistrations = controllers.flatMap(file => {
            const content = readFileSync(file, 'utf8');
            // 匹配 @Post('...runs/:runId/cancel') 这类装饰器
            const matches = content.match(/@Post\(['"][^'"]*runs\/:runId\/cancel['"]\)/g);
            return matches ?? [];
        });

        expect(cancelRegistrations).toHaveLength(1);
        expect(cancelRegistrations[0]).toContain('cancel');
    });

    it('registers streamRun route only in runs.controller', () => {
        const streamRegistrations = controllers.flatMap(file => {
            const content = readFileSync(file, 'utf8');
            const matches = content.match(/@Post\(['"][^'"]*runs\/stream['"]\)/g);
            return matches ?? [];
        });
        expect(streamRegistrations).toHaveLength(1);
    });
});
