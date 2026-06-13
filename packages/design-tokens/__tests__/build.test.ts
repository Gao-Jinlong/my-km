import { execSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const pkgDir = resolve(__dirname, '..');
const distDir = resolve(pkgDir, 'dist');

describe('token build pipeline', () => {
    beforeAll(() => {
        rmSync(distDir, { recursive: true, force: true });
        execSync('pnpm build', { cwd: pkgDir, stdio: 'inherit' });
    });

    afterAll(() => {});

    it('emits all four artifacts', () => {
        expect(existsSync(resolve(distDir, 'tokens.css'))).toBe(true);
        expect(existsSync(resolve(distDir, 'tokens.ts'))).toBe(true);
        expect(existsSync(resolve(distDir, 'tokens.json'))).toBe(true);
        expect(existsSync(resolve(distDir, 'tokens.d.ts'))).toBe(true);
    });

    it('tokens.css has root + dark scoped blocks', () => {
        const css = readFileSync(resolve(distDir, 'tokens.css'), 'utf8');
        expect(css).toMatch(/:root,\s*\[data-theme="light"\]\s*\{/);
        expect(css).toMatch(/\[data-theme="dark"\]\s*\{/);
        expect(css).toMatch(/--color-bg-primary:\s*#ffffff;/);
        expect(css).toMatch(/--workspace-accent-default:\s*#0969da;/);
    });

    it('tokens.css scopes dark workspace accent to the dark anchor', () => {
        const css = readFileSync(resolve(distDir, 'tokens.css'), 'utf8');
        const darkBlock = css.split('[data-theme="dark"]')[1] ?? '';
        expect(darkBlock).toMatch(/--workspace-accent-default:\s*#58a6ff;/);
    });

    it('tokens.json mirrors the schema shape', () => {
        const json = JSON.parse(readFileSync(resolve(distDir, 'tokens.json'), 'utf8')) as Record<
            string,
            unknown
        >;
        expect(json).toHaveProperty('themes.light.color.bg.primary', '#ffffff');
        expect(json).toHaveProperty('themes.dark.color.bg.primary', '#181818');
    });

    it('tokens.ts re-exports CSS-var bindings', () => {
        const ts = readFileSync(resolve(distDir, 'tokens.ts'), 'utf8');
        expect(ts).toContain('var(--color-bg-primary)');
        expect(ts).toContain('export const tokens');
    });

    it('tokens.d.ts declares typed token tree', () => {
        const dts = readFileSync(resolve(distDir, 'tokens.d.ts'), 'utf8');
        expect(dts).toContain('export declare const tokens');
    });
});
