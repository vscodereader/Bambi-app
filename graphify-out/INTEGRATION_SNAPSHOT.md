# Graphify Integration Snapshot

- Generated: 2026-08-06 (Asia/Seoul)
- Analysis root: `C:\Users\user\Documents\Codex\2026-08-03\ehd\graphify-latest-worktree`
- Scope: `apps`, `packages`, `docs`
- Base: `origin/develop` at `a9eb83602aa1597f0711a3362fd998cb86c701ca`
- Included implementation branches:
  - `feat/crawled-job-detail-image-editor` at `20f78a03113d3df45d9d412b3a784e1df7bce56c`
  - `fix/seeker-mobile-qa-issues` at `af9f7190e85376434c88a1df610ea36d0527b7e6`
  - `feat/main-popup-management` at `37d49797228899470ae8a0db6e9ca16478eb0d48`
- Included uncommitted popup-management changes:
  - `apps/server/src/plugins/orpc.ts`
  - `apps/web/src/components/bambi/main-popup/main-popup-layer.tsx`
  - `apps/web/src/components/bambi/main-popup/popup-date-time-picker.tsx`
  - `apps/web/src/components/bambi/main-popup/popup-management.tsx`
  - `apps/web/src/lib/bambi/main-popup.ts`
  - `docs/superpowers/plans/2026-08-05-main-popup-management.md`
  - `packages/api/src/routers/bambi/main-popups.ts`
  - `apps/web/src/components/bambi/main-popup/main-popup-layer.test.ts`
  - `apps/web/src/lib/bambi/main-popup.test.ts`

## Merge note

The integration snapshot is temporary and was not pushed. The popup branch had migration metadata conflicts at `0063_snapshot.json` and `_journal.json`. The snapshot retained the latest develop/image-editor migration metadata while including the popup SQL file, TypeScript schema, API, and UI implementation. This resolution exists only for analysis and is not a production merge recommendation.

## Extraction note

Graphify structurally extracted TypeScript and other supported code. Seventy-one SQL files did not produce AST nodes because the optional `tree_sitter_sql` dependency is not installed. Database concepts remain represented through the TypeScript Drizzle schema, API code, and semantic documents.
