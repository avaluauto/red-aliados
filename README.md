# Red Aliados

Red de conexiones B2B para concesionarios Avaluauto: permite a los tenants compartir inventario entre sí mediante conexiones de doble consentimiento, con identidad federada desde Avaluauto V2.

## Estado del proyecto

MVP en construcción activa. El cambio en curso es `red-aliados-core-mvp` (ver `openspec/changes/red-aliados-core-mvp/` para la propuesta, especificaciones, diseño y tareas).

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
