# @my-km/design-system

Primitives + patterns + Tailwind preset for my-km. See `docs/design-system/spec.md`.

This package is a **shell** in Stage 0/1a — populated in plan #2.

## Tailwind preset

```ts
// apps/web/tailwind.config.ts
import preset from '@my-km/design-system/tailwind-preset';

export default {
  presets: [preset],
  content: ['./src/**/*.{ts,tsx,mdx}'],
};
```
