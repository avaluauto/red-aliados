import { Link } from "@tanstack/react-router";

// Presentational shell -- no domain logic of its own; the actual sign-in
// form/call lives at the dedicated /login route (../../../routes/login.tsx
// -> SignInForm.tsx -> ../hooks/useSignIn -> ../data/sign-in). Structurally
// mirrors a marketing landing page (header / hero / stats / features /
// how-it-works / banner / footer), restyled to match the reference
// prototype's layout (two-column hero with a product-preview card, a
// full-bleed dark stats band, a bordered how-it-works panel with a
// horizontal step row, etc.) using this app's own design tokens (see
// index.css's @theme block) and original copy. Two things are deliberately
// removed/replaced from the reference: no "Comunidad" section, and no
// open/public vehicle catalog ("Explorar vehículos" or similar) -- Red
// Aliados never has an anonymous browsing surface. The header's "Iniciar
// sesión" button navigates to /login instead of toggling an inline panel --
// see routes/login.tsx for that page; there is still no self-registration
// anywhere in this shell.

type Stat = {
  readonly big: string;
  readonly description: string;
};

// Structure-only -- deliberately no numbers here. The original reference
// design shows concrete counts (e.g. "1.800+ vehículos"); those were
// fabricated for the prototype and are not real data Red Aliados can back
// today, so this row keeps the visual rhythm of a stats band (large bold
// anchor + short description) without asserting numbers that aren't true.
const STATS: readonly Stat[] = [
  {
    big: "Verificado",
    description: "Cada concesionario entra con su cuenta real de Avaluauto, sin cuentas anónimas.",
  },
  {
    big: "Doble opt-in",
    description: "Nadie ve tus datos de contacto sin que ambas partes acepten la conexión.",
  },
  {
    big: "Tiempo real",
    description: "La reputación y los mensajes se actualizan al instante con cada operación.",
  },
  {
    big: "Sin WhatsApp",
    description:
      "Todo pasa por los hilos de mensajería propios de la red, nada de grupos externos.",
  },
];

type Feature = {
  readonly icon: string;
  readonly badgeClass: string;
  readonly title: string;
  readonly description: string;
};

const FEATURES: readonly Feature[] = [
  {
    icon: "🔎",
    badgeClass: "bg-purple-100 text-purple-600",
    title: "Buscá más rápido",
    description:
      "Publicá lo que necesitás y llegá a los concesionarios de la red que ya tienen ese vehículo, sin recorrer grupos de WhatsApp.",
  },
  {
    icon: "✓",
    badgeClass: "bg-green-100 text-green-600",
    title: "Inventario verificado",
    description:
      "El stock que ves viene directo de la cuenta de Avaluauto de cada concesionario, sincronizado en modo lectura.",
  },
  {
    icon: "🤝",
    badgeClass: "bg-amber-100 text-amber-600",
    title: "Miembros de confianza",
    description:
      "Las conexiones se confirman por doble opt-in: nadie ve tus datos de contacto sin que ambas partes lo acepten.",
  },
  {
    icon: "★",
    badgeClass: "bg-blue-100 text-blue-600",
    title: "Reputación visible",
    description:
      "Cada intercambio suma a un puntaje de reputación según qué tan rápido y bien respondés.",
  },
  {
    icon: "🔔",
    badgeClass: "bg-pink-100 text-pink-600",
    title: "Notificaciones en tiempo real",
    description:
      "Los mensajes de tus conexiones llegan por hilos en tiempo real, sin depender de otra app.",
  },
  {
    icon: "📈",
    badgeClass: "bg-teal-100 text-teal-600",
    title: "Más oportunidades de negocio",
    description:
      "Cuando no tenés el vehículo en stock, tu solicitud llega a la red de aliados conectados que sí lo tienen.",
  },
];

type Step = {
  readonly circleClass: string;
  readonly title: string;
  readonly description: string;
};

// Color progression across the step circles echoes the reference's visual
// rhythm (dark -> primary -> brand -> success) without changing any theme
// token values.
const STEPS: readonly Step[] = [
  {
    circleClass: "bg-dark",
    title: "Iniciá sesión con tu cuenta de Avaluauto",
    description: "Ingresá con tu email y contraseña de Avaluauto, sin nada que registrar.",
  },
  {
    circleClass: "bg-primary",
    title: "Conectá con otros concesionarios",
    description:
      "Enviá o aceptá solicitudes de conexión. Se confirman por doble opt-in antes de compartir datos de contacto.",
  },
  {
    circleClass: "bg-primary",
    title: "Buscá o publicá solicitudes",
    description:
      "Encontrá vehículos en tu propio stock primero; si no está, tu búsqueda llega a la red de conexiones.",
  },
  {
    circleClass: "bg-brand",
    title: "Negociá directamente",
    description: "Una vez conectados, hablan directo por el hilo de mensajería de Red Aliados.",
  },
  {
    circleClass: "bg-success",
    title: "Cerrá con confianza",
    description: "Cada operación cerrada suma a tu reputación, visible para el resto de la red.",
  },
];

const NAV_LINKS: readonly { readonly label: string; readonly href: string }[] = [
  { label: "Por qué Red Aliados", href: "#por-que" },
  { label: "Cómo funciona", href: "#como-funciona" },
];

// Purely decorative overlapping-avatar stand-in for the hero's social-proof
// row -- CSS gradient circles at different opacities, no real images and no
// fabricated headcount.
const AVATAR_STACK_OPACITIES: readonly number[] = [1, 0.85, 0.7, 0.55];

export function PublicLandingShell() {
  const year = new Date().getFullYear();

  return (
    <div className="min-h-screen bg-white">
      <header className="sticky top-0 z-10 border-b border-border bg-white/95 backdrop-blur">
        <div className="mx-auto grid max-w-6xl grid-cols-[auto_1fr_auto] items-center gap-4 px-6 py-4">
          <div className="flex items-center gap-2.5">
            <span
              aria-hidden="true"
              className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary font-head text-sm font-bold text-white"
            >
              A
            </span>
            <span className="font-head text-lg font-bold text-dark">Avaluauto</span>
            <span className="text-sm font-medium text-muted">Red Aliados</span>
          </div>
          <nav
            aria-label="Principal"
            className="hidden justify-center sm:flex sm:items-center sm:gap-8"
          >
            {NAV_LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="text-sm font-medium text-muted transition-colors hover:text-dark"
              >
                {link.label}
              </a>
            ))}
          </nav>
          <Link
            to="/login"
            className="justify-self-end rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-primary/90"
          >
            Iniciar sesión
          </Link>
        </div>
      </header>

      <main>
        <section className="mx-auto grid max-w-6xl gap-12 px-6 py-16 lg:grid-cols-[1.1fr_1fr] lg:items-center lg:gap-10 lg:py-24">
          <div className="flex flex-col items-start gap-6 text-left">
            <span className="inline-flex items-center gap-2 rounded-full bg-tint px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-primary">
              <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-primary" />
              Exclusivo para la red Avaluauto
            </span>
            <h1 className="font-head text-4xl font-bold leading-tight text-dark sm:text-[52px] sm:leading-[1.1]">
              La red donde los concesionarios de Avaluauto se conectan y cierran operaciones{" "}
              <span className="text-primary">más rápido</span>
            </h1>
            <p className="max-w-xl text-lg text-body">
              Red Aliados conecta a los concesionarios de la red Avaluauto para buscar, publicar y
              cerrar operaciones de vehículos directamente con otros miembros verificados, dejando
              atrás el caos de los grupos de WhatsApp.
            </p>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Link
                to="/login"
                className="rounded-xl bg-primary px-7 py-[15px] text-center text-sm font-semibold text-white shadow-md transition-colors hover:bg-primary/90"
              >
                Iniciar sesión
              </Link>
              <a
                href="#como-funciona"
                className="rounded-xl border border-border-2 bg-white px-7 py-[15px] text-center text-sm font-semibold text-dark transition-colors hover:border-primary hover:text-primary"
              >
                Ver cómo funciona
              </a>
            </div>
            <div className="flex items-center gap-3 pt-2">
              <div aria-hidden="true" className="flex -space-x-2.5">
                {AVATAR_STACK_OPACITIES.map((opacity) => (
                  <span
                    key={opacity}
                    className="h-8 w-8 rounded-full border-2 border-white bg-[image:var(--brand-grad)]"
                    style={{ opacity }}
                  />
                ))}
              </div>
              <p className="text-sm text-muted">Concesionarios ya conectados en la red</p>
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-white shadow-lg">
            <div className="flex items-center gap-1.5 border-b border-border px-4 py-3">
              <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full bg-border-2" />
              <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full bg-border-2" />
              <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full bg-border-2" />
            </div>
            <div className="p-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                Vehículo destacado
              </p>
              <div className="mt-3 grid gap-4 sm:grid-cols-2">
                <div className="rounded-xl border border-border p-3">
                  <div aria-hidden="true" className="aspect-video w-full rounded-lg bg-tint" />
                  <div className="mt-3 h-3 w-3/4 rounded bg-border-2" />
                  <div className="mt-2 h-3 w-1/2 rounded bg-border" />
                </div>
                <div className="flex flex-col justify-center rounded-xl bg-tint p-4">
                  <span aria-hidden="true" className="text-xl">
                    🔔
                  </span>
                  <p className="mt-2 text-sm font-semibold text-dark">Nueva conexión disponible</p>
                  <p className="mt-1 text-xs text-body">
                    Un concesionario de la red quiere conectar con vos.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="bg-dark px-6 py-12 text-white">
          <div className="mx-auto grid max-w-6xl gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {STATS.map((stat) => (
              <div key={stat.big} className="text-center">
                <p className="font-head text-2xl font-bold text-white">{stat.big}</p>
                <p className="mt-2 text-sm text-white/70">{stat.description}</p>
              </div>
            ))}
          </div>
        </section>

        <section id="por-que" className="px-6 py-20">
          <div className="mx-auto max-w-6xl">
            <p className="text-center text-sm font-semibold uppercase tracking-wide text-primary">
              Por qué Red Aliados
            </p>
            <h2 className="mt-2 text-center font-head text-3xl font-bold text-dark sm:text-[36px]">
              Toda la agilidad del WhatsApp, sin el ruido
            </h2>
            <div className="mt-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map((feature) => (
                <div key={feature.title} className="text-left">
                  <span
                    aria-hidden="true"
                    className={`flex h-11 w-11 items-center justify-center rounded-xl text-xl ${feature.badgeClass}`}
                  >
                    {feature.icon}
                  </span>
                  <h3 className="mt-4 font-head text-[19px] font-semibold text-dark">
                    {feature.title}
                  </h3>
                  <p className="mt-2 text-sm text-body">{feature.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="como-funciona" className="bg-tint px-6 py-20">
          <div className="mx-auto max-w-6xl rounded-2xl border border-border-2 bg-white p-8 shadow-md sm:p-12">
            <p className="text-center text-sm font-semibold uppercase tracking-wide text-primary">
              Cómo funciona
            </p>
            <h2 className="mt-2 text-center font-head text-3xl font-bold text-dark sm:text-[36px]">
              Cinco pasos para empezar a operar
            </h2>
            <ol className="mt-12 grid gap-10 sm:grid-cols-2 lg:grid-cols-5">
              {STEPS.map((step, index) => (
                <li key={step.title} className="flex flex-col items-center text-center">
                  <span
                    aria-hidden="true"
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full font-head text-sm font-semibold text-white ${step.circleClass}`}
                  >
                    {index + 1}
                  </span>
                  <h3 className="mt-4 font-head text-base font-semibold text-dark">{step.title}</h3>
                  <p className="mt-1 text-sm text-body">{step.description}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="bg-[image:var(--brand-grad)] px-6 py-20 text-center text-white">
          <div className="mx-auto max-w-xl">
            <h2 className="font-head text-3xl font-bold sm:text-[36px]">
              Dejá el caos de los grupos de WhatsApp atrás
            </h2>
            <p className="mt-3 text-white/90">
              Red Aliados vive dentro de tu cuenta de Avaluauto: nada de coordinar precios y
              disponibilidad a los gritos en un grupo.
            </p>
            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
              <Link
                to="/login"
                className="rounded-xl bg-white px-7 py-[15px] text-sm font-semibold text-primary shadow-md transition-colors hover:bg-white/90"
              >
                Iniciar sesión
              </Link>
              <a
                href="#como-funciona"
                className="rounded-xl border border-white/40 bg-white/10 px-7 py-[15px] text-sm font-semibold text-white transition-colors hover:bg-white/20"
              >
                Ver cómo funciona
              </a>
            </div>
          </div>
        </section>
      </main>

      <footer className="bg-dark px-6 py-8 text-white">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-4 sm:flex-row sm:justify-between">
          <div className="flex items-center gap-2.5">
            <span
              aria-hidden="true"
              className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary font-head text-xs font-bold text-white"
            >
              A
            </span>
            <span className="font-head font-semibold text-white">Avaluauto</span>
          </div>
          <nav aria-label="Legal" className="flex items-center gap-6 text-sm text-white/70">
            <a href="#terminos" className="transition-colors hover:text-white">
              Términos
            </a>
            <a href="#privacidad" className="transition-colors hover:text-white">
              Privacidad
            </a>
          </nav>
          <p className="text-sm text-white/60">
            © {year} Avaluauto. Todos los derechos reservados.
          </p>
        </div>
      </footer>
    </div>
  );
}
