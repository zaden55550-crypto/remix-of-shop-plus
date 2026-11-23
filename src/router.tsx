// Fresh start: runs before anything reads device storage (src/lib/fresh-start.ts).
import "@/lib/fresh-start";
// A sample shop left open when the browser closed puts the real business back first (sample-shop.ts).
import "@/lib/sample-shop";
import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

// A page file updated while the tab was open can no longer be fetched; reload once to get the fresh copy.
if (typeof window !== "undefined") {
  const reloadOnce = (msg: string) => {
    if (!/dynamically imported module|Importing a module script failed/i.test(msg)) return;
    if (sessionStorage.getItem("shopbook.chunk-reload")) return;
    sessionStorage.setItem("shopbook.chunk-reload", "1");
    window.location.reload();
  };
  window.addEventListener("vite:preloadError", () => reloadOnce("dynamically imported module"));
  window.addEventListener("unhandledrejection", e => reloadOnce(String(e.reason?.message ?? e.reason)));
  window.addEventListener("error", e => reloadOnce(String(e.message)));
  window.addEventListener("load", () => setTimeout(() => sessionStorage.removeItem("shopbook.chunk-reload"), 10000));
}

export const getRouter = () => {
  const queryClient = new QueryClient();

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });

  return router;
};
