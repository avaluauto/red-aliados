// Single-build hostname split: one Vite/React build (apps/web) serves both
// the marketing/root domain and the authenticated "app." subdomain, and
// branches purely at runtime on window.location.hostname -- no separate
// package, no build-time env flag. Locally, any "*.localhost" hostname
// (e.g. app.localhost) resolves to 127.0.0.1 in modern browsers per RFC
// 6761, and Vite's dev server already binds to a wildcard host, so
// http://app.localhost:5173 works as a stand-in for the real subdomain with
// zero extra config. See routes/__root.tsx for where this is consumed.

// Deliberately a function, not a module-level constant: callers (and tests)
// need to re-evaluate window.location on every call, not capture it once at
// module load.
export function isAppHost(): boolean {
  return window.location.hostname.startsWith("app.");
}

// Builds the app-host origin equivalent to the CURRENT origin, preserving
// protocol and port -- http://localhost:5173 -> http://app.localhost:5173,
// https://redaliados.com -> https://app.redaliados.com. Used by the
// marketing page (PublicLandingShell) to build cross-origin links into the
// app host (e.g. `${getAppOrigin()}/login`), since a same-origin client-side
// <Link> can't navigate across hostnames.
export function getAppOrigin(): string {
  const { protocol, hostname, port } = window.location;
  const portSuffix = port ? `:${port}` : "";
  return `${protocol}//app.${hostname}${portSuffix}`;
}
