# supabase/functions

Deno Edge Functions. This directory is **intentionally excluded** from the
pnpm workspace (`pnpm-workspace.yaml` only lists `apps/*` and `packages/*`)
and from the root `pnpm -r typecheck` / `pnpm -r --filter=./packages/*`
scripts — Deno has its own runtime, module resolution (bare specifiers via
`npm:`/`https://esm.sh/...`, not `node_modules`), and type-checker
(`deno check`), which is a different toolchain than the rest of this
monorepo.

## Status (PR4)

**NOT executed.** No Deno runtime or Supabase CLI is available in the
sandbox this PR was implemented in (`deno --version` / `supabase --version`
both resolve to nothing — see apply-progress topic
`sdd/red-aliados-core-mvp/apply-progress`, same pattern PR1-PR3 used for
whatever genuinely couldn't run). `deno.d.ts` in `_shared/` is a minimal
ambient shim for editor convenience only, not a substitute for `deno check`.

## Structure

- `ingest-vehicle-event/index.ts` — thin `Deno.serve` wrapper. All real
  logic (HMAC verification, dedupe, seq-gated upsert) lives in
  `@red-aliados/vehicle-sync` (`packages/vehicle-sync`), a normal pnpm
  package covered by `pnpm -r typecheck` and a real Vitest suite that DOES
  run in this sandbox — see that package's README/comments for what was
  actually verified.
- `reconcile-outbox/index.ts` — same pattern; wraps
  `runReconcileOutbox` from `@red-aliados/vehicle-sync`.
- `_shared/supabase-sync-store.ts` — the real (Postgres-backed) `SyncStore`
  implementation, Deno-only (uses `Deno.env`, `npm:@supabase/supabase-js`).
  Genuinely untested here — the interface it implements
  (`packages/vehicle-sync/src/store.ts`) IS thoroughly tested via
  `packages/vehicle-sync/src/testing/in-memory-store.ts`, a fake with the
  same on-conflict-do-nothing / seq-gate semantics a real Postgres instance
  would enforce. First action for whoever gets a real Supabase project:
  run `deno check` on this whole directory, then a real end-to-end webhook
  delivery against a live `sync_event_log`/`vehicle_snapshots`.
- `_shared/deno.d.ts` — editor-only ambient `Deno` global shim.

## Both entrypoints import `@red-aliados/vehicle-sync` via a relative path

(`../../../packages/vehicle-sync/src/index.ts`), not the package specifier —
Deno resolves plain relative `.ts` imports directly with no bundler or
`node_modules` involved, which works better across the Deno/pnpm boundary
than trying to make Deno understand a pnpm workspace symlink.
