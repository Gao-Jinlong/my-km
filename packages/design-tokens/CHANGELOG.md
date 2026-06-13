# @my-km/design-tokens — CHANGELOG

## 0.1.0 — 2026-06-13

Initial release (Stage 0 + Stage 1a).

### Added

- Tier 1 reference palette (`gray`, `blue`, `red`, `green`, `yellow`, `darkSurface`, `darkText`, `darkAccent`)
- `tokenSchema` (zod) for theme shape validation
- `themes.light` and `themes.dark` with `color.*`, `editor.*`, `workspace.*` branches
- `scripts/build.ts` emitting `tokens.css`, `tokens.ts`, `tokens.json`, `tokens.d.ts` to `dist/`
- `scripts/verify.ts` for CI-only schema validation
- `alpha()`, `flatten()`, `toCssVar()` utilities

### Migrated from `apps/web/src/app/globals.css`

- `--ws-*` workspace tokens — now `--workspace-*` (consumed via Tailwind preset shim and `globals.css` `@theme inline` bridges)
- Light/dark workspace anchors preserved verbatim
