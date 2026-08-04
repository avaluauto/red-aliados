import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { render } from "@testing-library/react";
import type { ReactNode } from "react";

// Shared test helper for components that render TanStack Router's <Link>
// or call useNavigate (e.g. SessionUnavailableState.tsx's redirect-to-/login,
// login.tsx's LoginPage) -- both need a real router context to work, which plain
// @testing-library/react `render` doesn't provide. Builds a minimal
// in-memory router with a "/" route (rendering the component under test)
// and a stand-in "/login" route, then awaits the router's initial load so
// the first render is already settled (avoids act() warnings/empty-body
// flakiness from TanStack Router's async initial match).
export type RenderWithRouterOptions = {
  readonly initialPath?: string;
  readonly loginContent?: ReactNode;
};

// Narrow structural type for what callers actually need from the router
// (asserting on the current location after a navigation) -- deliberately
// NOT `ReturnType<typeof createRouter>`, which drags in generic route-tree
// types that conflict with `exactOptionalPropertyTypes` across this
// composite build.
export type TestRouterHandle = {
  readonly state: { readonly location: { readonly pathname: string } };
};

// Explicit return type: without it, TS infers a type that reaches into
// @testing-library/react's re-exported `pretty-format` types, which tsc's
// composite build can't name portably (TS2742).
export async function renderWithRouter(
  ui: ReactNode,
  options: RenderWithRouterOptions = {},
): Promise<ReturnType<typeof render> & { router: TestRouterHandle }> {
  const { initialPath = "/", loginContent = <p>Login route</p> } = options;
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  const rootRoute = createRootRoute();
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    component: () => ui,
  });
  const loginRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/login",
    component: () => loginContent,
  });
  const routeTree = rootRoute.addChildren([indexRoute, loginRoute]);
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [initialPath] }),
  });

  await router.load();

  const result = render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );

  return { ...result, router };
}
