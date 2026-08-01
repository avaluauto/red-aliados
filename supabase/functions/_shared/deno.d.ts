// Minimal ambient typing for the Deno Edge Runtime globals used under
// supabase/functions/. This directory is intentionally OUTSIDE the pnpm
// workspace (see supabase/functions/README.md) -- Deno has its own type
// resolution (`deno check`, powered by the Deno LSP / `deno.ns` lib) and
// does not need @types/node. This file exists only so editors without the
// Deno extension don't flag `Deno.*` as unresolved; it is NOT a substitute
// for `deno check`, which was never run in this sandbox (no Deno runtime
// installed -- see apply-progress).
declare namespace Deno {
  function serve(handler: (req: Request) => Response | Promise<Response>): void;
  const env: {
    get(key: string): string | undefined;
  };
}
