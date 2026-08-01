// Presentational (spec: Module Gate). Deliberately has no form, no input,
// no button -- there is no registration path in Red Aliados, ever.
export function ModuleDisabledState() {
  return (
    <div
      role="status"
      className="flex min-h-screen flex-col items-center justify-center gap-2 px-6 text-center"
    >
      <h1 className="text-xl font-semibold">Red Aliados isn't enabled for your dealership</h1>
      <p className="text-slate-600">
        This module is turned on from Avaluauto. Contact your account admin if you think it should
        be available.
      </p>
    </div>
  );
}
