// Presentational. Brief initial-load state while the session query resolves.
export function SessionLoadingState() {
  return (
    <div role="status" aria-live="polite" className="flex min-h-screen items-center justify-center">
      <p className="text-slate-500">Loading…</p>
    </div>
  );
}
