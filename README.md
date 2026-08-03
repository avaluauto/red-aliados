# Red Aliados

Red de conexiones B2B para concesionarios Avaluauto: permite a los tenants compartir inventario entre sí mediante conexiones de doble consentimiento, con identidad federada desde Avaluauto V2.

## Estado del proyecto

Las 8 capacidades del MVP (`identity-bridge`, `network-authorization`,
`vehicle-sync`, `tenant-directory`, `network-connections`,
`partner-reputation`, `connection-messaging`, `targeted-search`) están
implementadas, cada una en su propio PR (PR2-PR9), y cada una revisada de
forma independiente. Este PR (PR10, el último de la cadena) cierra el
cambio `red-aliados-core-mvp` con una prueba e2e de integración que compone
el flujo completo (ver `apps/web/e2e/cross-capability-flow.spec.ts`) y esta
actualización de documentación — ver `openspec/changes/red-aliados-core-mvp/`
para la propuesta, especificaciones, diseño y tareas completas.

Dos rondas de revisión de seguridad quedaron documentadas dentro de PRs ya
abiertos, no como PRs separados:

- **PR6** (`network-connections`): una corrección sobre la política RLS
  `insert_own_request` (`supabase/migrations/0003_rls_policies.sql`) para
  cerrar un permiso de actualización de más (`0007_fix_connection_request_update_grant.sql`).
- **PR9** (`targeted-search`): dos hallazgos CRITICAL contra
  `insert_own_request` y sus propios helpers nuevos, corregidos ambos dentro
  de `supabase/migrations/0009_fix_insert_own_request_provenance.sql` — (1)
  la política no validaba que `recipient_tenant_id` tuviera una relación
  real con el origen declarado de la fila, permitiendo fabricar solicitudes
  hacia un tenant arbitrario; (2) los dos helpers `SECURITY DEFINER` nuevos
  (`app.vehicle_snapshot_owned_by`, `app.search_match_provenance_valid`) eran
  invocables directamente vía PostgREST RPC por cualquier usuario
  autenticado sin las mismas compuertas `module_enabled()`/
  `has_network_access()` que el resto de los helpers `app.*` ya tienen,
  actuando como oráculo de relaciones cross-tenant. Ambos hallazgos fueron
  verificados con pruebas de regresión reales contra un clúster Postgres
  desechable antes y después del fix.

### Preguntas de negocio abiertas (bloquean ir a producción)

Estas decisiones son externas a este repo y siguen sin resolverse:

1. **Nombre final del módulo** — "Aliados" colisiona con un módulo ya
   existente en V2. Falta un nombre definitivo (ver
   `openspec/changes/red-aliados-core-mvp/design.md`, sección "Open
   Questions").
2. **Algoritmo de firma del JWT de V2** — Third-Party Auth de Supabase
   requiere un algoritmo asimétrico (RS256/ES256); si V2 sigue emitiendo
   tokens HS256 (simétrico) heredados, identity-bridge no puede activarse
   contra un proyecto real. Ver `supabase/THIRD_PARTY_AUTH.md`, sección
   "Preconditions on the V2 side", punto 1. Sin confirmar.
3. **Forma exacta de la autenticación del webhook** entre V2 y la función
   edge `ingest-vehicle-event` — el código asume HMAC-SHA256 sobre el header
   `X-Signature` con un secreto compartido (`VEHICLE_SYNC_WEBHOOK_SECRET`,
   ver `supabase/functions/ingest-vehicle-event/index.ts` y
   `packages/vehicle-sync/src/hmac.ts`), pero esta forma nunca fue
   confirmada contra un endpoint real de V2 — es una suposición documentada,
   no un contrato acordado.
4. **Si `ally_price`/`min_price` ya existen tal cual en el registro de
   vehículo de V2** — el esquema del webhook (`packages/contracts/src/zod/vehicle-sync.ts`)
   asume esos dos nombres de columna 1:1 con `public.vehicle_snapshots`
   (`supabase/migrations/0001_core_schema.sql`), pero nunca se confirmó
   contra el payload real que V2 emite. Los campos descriptivos adicionales
   que sí menciona el brief original (`line`, `version`, `km`, `city`,
   `engine`, `transmission`) se aceptan en el schema como forward-compat
   mas no se persisten — no existe columna para ellos todavía.

### Brechas de verificación conocidas

Un puñado de escenarios quedaron honestamente marcados como no ejecutables
sin un proyecto Supabase real (no hay ninguno desplegado en este sandbox —
ver `supabase/THIRD_PARTY_AUTH.md`, "Status: NOT CONFIGURED"), en vez de
simularlos con un mock que solo probaría la propia expectativa del test:

- `apps/web/e2e/network-authorization.spec.ts` (PR3) — `test.skip`: "direct
  Supabase query bypassing the client guard is still denied by RLS (zero
  rows)". Requiere un round-trip real contra PostgREST + RLS.
- `apps/web/e2e/network-connections.spec.ts` (PR6) — `test.skip`: "a normal
  authenticated user cannot directly insert a direct-origin
  connection_requests row (denied by RLS)". Misma razón.

Además, varias specs sí se ejecutan pero prueban explícitamente solo el
cableado del lado cliente, dejando documentado (no oculto) que la garantía
de servidor equivalente (RLS, un trigger, o `pg_cron`) requiere ese mismo
proyecto real para cerrarse del todo — ver las cabeceras de
`connection-messaging.spec.ts` (PR8), `targeted-search.spec.ts` (PR9) y
`partner-reputation.spec.ts` (PR7), y los comentarios de
`0005_pg_cron_reconcile.sql`/`0006_pg_cron_expire_requests.sql` (pg_cron/
pg_net no disponibles en este sandbox). El primer paso, en todos los casos,
está escrito en el propio archivo: des-saltear el test y repetir el
escenario contra un proyecto Supabase real.

## Principios

- **Avaluauto V2 es la única fuente de identidad.** Red Aliados no tiene tabla de usuarios propia ni formulario de registro — la sesión llega vía JWT federado (Supabase Third-Party Auth).
- **Avaluauto V2 es el único escritor.** Red Aliados es de solo lectura sobre datos sincronizados por evento (patrón outbox). Ninguna pantalla edita precio, fotos o estado de un vehículo.
- **Visibilidad estrictamente cerrada por red.** Nada es público ni abierto a todo el que esté logueado — solo se ve inventario y solicitudes de tenants con conexión mutua activa.

## Stack

- **Monorepo:** pnpm workspaces
- **`apps/web`:** Vite + React 19 + TypeScript estricto, TanStack Router/Query, Zustand, React Hook Form + Zod, Tailwind
- **`packages/contracts`:** tipos generados desde el esquema de base de datos + schemas Zod compartidos
- **Backend:** Supabase (Postgres + RLS + Edge Functions) — sin worker propio, sincronización vía webhook + reconciliación programada
- **Testing:** Vitest + Testing Library, Playwright, pgTAP
- **Lint/format:** Biome

## Desarrollo local

```bash
pnpm install
pnpm --filter web dev
```

## Arquitectura y decisiones

La documentación completa de arquitectura (identidad, flujo de datos, esquema de base de datos, estructura de carpetas) vive en `openspec/changes/red-aliados-core-mvp/design.md`. Las especificaciones por capacidad están en `openspec/changes/red-aliados-core-mvp/specs/`.
