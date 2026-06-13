const HEX6 = /^#[0-9a-f]{6}$/;

/**
 * Append an alpha channel to a 6-digit lowercase hex color.
 * Returns an 8-digit hex (e.g. `#0969da2e`).
 */
export function alpha(hex: string, ratio: number): string {
    if (!HEX6.test(hex)) {
        throw new Error(`alpha(): expected 7-char lowercase hex, got ${JSON.stringify(hex)}`);
    }
    const clamped = Math.min(1, Math.max(0, ratio));
    const byte = Math.round(clamped * 255)
        .toString(16)
        .padStart(2, '0');
    return `${hex}${byte}`;
}

/** Convert a dotted token path to a CSS variable name: `color.bg.primary` → `--color-bg-primary` */
export function toCssVar(path: string): string {
    return `--${path.replace(/\./g, '-')}`;
}

/** Flatten a nested token tree into a flat record keyed by dotted path. */
export function flatten(
    node: unknown,
    prefix: string[] = [],
    out: Record<string, string> = {},
): Record<string, string> {
    if (typeof node === 'string') {
        out[prefix.join('.')] = node;
        return out;
    }
    if (node && typeof node === 'object') {
        for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
            flatten(value, [...prefix, key], out);
        }
    }
    return out;
}
