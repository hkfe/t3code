import { createRouter, RouterHistory } from "@tanstack/react-router";

import { routeTree } from "./routeTree.gen";

const NAVIGATION_VIEW_TRANSITION_TYPE = "t3-navigate";

function viewTransitionTypesSupported(): boolean {
  return typeof CSS !== "undefined" && CSS.supports("selector(:active-view-transition-type(a))");
}

export function getRouter(history: RouterHistory) {
  return createRouter({
    routeTree,
    history,
    context: {},
    defaultPreload: "intent",
    // Path changes cross-fade in one step so sidebar, header and chat change together.
    // Without view transition types the router would also fade search-only panel toggles.
    // The first load has nothing painted to fade from.
    ...(viewTransitionTypesSupported() && {
      defaultViewTransition: {
        types: ({ fromLocation, pathChanged }) =>
          fromLocation &&
          pathChanged &&
          !document.documentElement.dataset.mobileComposerRouteTransition
            ? [NAVIGATION_VIEW_TRANSITION_TYPE]
            : false,
      },
    }),
  });
}

export type AppRouter = ReturnType<typeof getRouter>;

declare module "@tanstack/react-router" {
  interface Register {
    router: AppRouter;
  }
}
