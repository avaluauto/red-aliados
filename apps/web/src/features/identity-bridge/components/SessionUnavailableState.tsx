// Presentational. Shown when there is no valid session at all (no session,
// or a JWT that failed claim-contract validation -- spec: Invalid or
// tampered JWT rejected). Never a login/registration form: V2 is the only
// place a session is created.
export function SessionUnavailableState() {
  return (
    <div
      role="status"
      className="flex min-h-screen flex-col items-center justify-center gap-2 px-6 text-center"
    >
      <h1 className="text-xl font-semibold">No active Red Aliados session</h1>
      <p className="text-slate-600">
        Open Red Aliados from Avaluauto to sign in -- there is no separate login here.
      </p>
    </div>
  );
}
