import { describe, expect, it } from 'vitest';
import { ref } from '../src/reference';
import { alpha } from '../src/utils';

describe('reference palette', () => {
    it('exposes a gray scale with anchor stops', () => {
        expect(ref.gray[0]).toBe('#ffffff');
        expect(ref.gray[900]).toBe('#1f2328');
        expect(ref.gray[1000]).toBe('#000000');
    });

    it('exposes a blue scale with brand accent at 500', () => {
        expect(ref.blue[500]).toBe('#0969da');
    });

    it('exposes feedback color anchors', () => {
        expect(ref.red[500]).toBe('#d1242f');
        expect(ref.green[500]).toBeDefined();
        expect(ref.yellow[500]).toBeDefined();
    });

    it('every color reference value is a 7-char lowercase hex', () => {
        const { typography, spacing, radius, shadow, motion, 'z-index': _zIndex, ...colors } = ref;
        const visit = (node: unknown): string[] => {
            if (typeof node === 'string') return [node];
            if (node && typeof node === 'object') {
                return Object.values(node as Record<string, unknown>).flatMap(visit);
            }
            return [];
        };
        const all = visit(colors);
        expect(all.length).toBeGreaterThan(20);
        for (const value of all) {
            expect(value).toMatch(/^#[0-9a-f]{6}$/);
        }
    });

    it('exposes a typography scale', () => {
        expect(ref.typography.family.sans).toContain('sans-serif');
        expect(ref.typography.family.mono).toContain('monospace');
        expect(ref.typography.size.xs).toBe('0.75rem');
        expect(ref.typography.size['3xl']).toBe('2.25rem');
        expect(ref.typography.weight.bold).toBe('700');
    });
});

describe('alpha()', () => {
    it('appends an 8-bit alpha channel to a 6-digit hex', () => {
        expect(alpha('#0969da', 1)).toBe('#0969daff');
        expect(alpha('#0969da', 0)).toBe('#0969da00');
        expect(alpha('#0969da', 0.18)).toBe('#0969da2e');
    });

    it('throws on invalid hex', () => {
        expect(() => alpha('blue', 0.5)).toThrow();
    });

    it('clamps alpha to [0, 1]', () => {
        expect(alpha('#000000', -1)).toBe('#00000000');
        expect(alpha('#000000', 2)).toBe('#000000ff');
    });
});
