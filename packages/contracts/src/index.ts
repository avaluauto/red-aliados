// Single source of truth for cross-package types and validation schemas.
//
// - `./db`  — Supabase DB types (Database, Tables<>, Views<>, ...). Populated
//             in PR1 (see src/db/index.ts) — currently hand-written to match
//             supabase/migrations/0001-0004, pending a real
//             `supabase gen types typescript` run once a local Supabase
//             instance is available (see src/db/index.ts's top comment).
// - `./zod` — shared Zod schemas (webhook payloads, entity DTOs) hand-written
//             on top of the DB types. Populated in PR4 (vehicle-sync).
//
// This root barrel stays empty by design — consumers import the specific
// subpath (`@red-aliados/contracts/db` or `@red-aliados/contracts/zod`) they
// need, so an unrelated feature never pulls in the whole contracts surface.
export {};
