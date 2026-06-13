# @my-km/design-tokens

Single source of truth for my-km design tokens.

See `docs/design-system/spec.md` §2 and `docs/design-system/decisions/0001-token-tiering.md`.

## Scripts

- `pnpm build` — generates `dist/tokens.css`, `dist/tokens.ts`, `dist/tokens.json`, `dist/tokens.d.ts`
- `pnpm verify` — validates light/dark theme shapes match
- `pnpm test` — runs vitest

## Consumption

```css
@import "@my-km/design-tokens/dist/tokens.css";
```

```ts
import { tokens } from '@my-km/design-tokens/dist/tokens';
```
