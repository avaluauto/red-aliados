// Single source of truth for cross-package types and validation schemas.
//
// - `./db`  — generated Supabase types (`supabase gen types typescript`).
//             Populated in PR1 once the schema migrations exist.
// - `./zod` — shared Zod schemas (webhook payloads, entity DTOs) hand-written
//             on top of the generated DB types.
//
// This barrel is intentionally empty until PR1 introduces real content.
export {};
