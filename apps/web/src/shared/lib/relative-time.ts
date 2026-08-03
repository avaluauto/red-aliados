// Tiny local relative-time formatter for routes/index.tsx's "Actividad
// reciente" feed -- each row needs a "Hace Nh" style timestamp, and pulling
// in a date library for one formatter would be overkill (no new npm
// dependency for a single function, same constraint the dashboard's chart
// follows for plain-div bars instead of a charting package).
//
// `now` is a parameter, not read internally via `new Date()`, so callers/
// tests can pin it -- same pattern host-mode.ts's own tests use by stubbing
// window.location rather than relying on real wall-clock time.
const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

export function formatRelativeTime(isoDate: string, now: Date = new Date()): string {
  const thenMs = new Date(isoDate).getTime();
  const diffMs = Math.max(0, now.getTime() - thenMs);

  if (diffMs < MINUTE_MS) {
    return "Hace instantes";
  }
  if (diffMs < HOUR_MS) {
    const minutes = Math.floor(diffMs / MINUTE_MS);
    return `Hace ${minutes}min`;
  }
  if (diffMs < DAY_MS) {
    const hours = Math.floor(diffMs / HOUR_MS);
    return `Hace ${hours}h`;
  }
  const days = Math.floor(diffMs / DAY_MS);
  return days === 1 ? "Hace 1 día" : `Hace ${days} días`;
}
