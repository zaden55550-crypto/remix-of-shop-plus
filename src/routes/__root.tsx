// Fresh start: runs before anything reads device storage (src/lib/fresh-start.ts).
import "@/lib/fresh-start";
import { startPdfSharing } from "@/lib/share-pdf";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { FirstTimeHint } from "@/components/shopbook/first-time-hint";
import { AutoSummary } from "@/components/shopbook/auto-summary";
import { SampleShopBar } from "@/components/shopbook/try-and-tour";
import { OnePageFit } from "@/components/shopbook/one-page-fit";
import { IdleLogout } from "@/components/shopbook/idle-logout";
import { applyLaptopView } from "@/lib/laptop-view";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  useRouterState,
  HeadContent,
  Scripts,
  type ErrorComponentProps,
} from "@tanstack/react-router";
import { useEffect, useLayoutEffect, type ReactNode } from "react";
// The viewport is set before the new screen is drawn, so a screen never shows at the previous page's scale.
const useBeforePaint = typeof window === "undefined" ? useEffect : useLayoutEffect;
import { applyUiSize } from "@/lib/prefs";
import { applySettings } from "@/lib/settings-config";
import { startCloudBackup } from "@/lib/cloud-backup";
import { startAutoSnapshots } from "@/lib/snapshots";
import { startAutoLocalBackups } from "@/lib/local-backups";
import { startShopSync } from "@/lib/shop-sync";
import { StaffGate } from "@/components/shopbook/staff-gate";
import { AppAccessGate } from "@/components/shopbook/app-access-gate";
import { startConnectivity } from "@/lib/connectivity";
import { startFitText } from "@/lib/fit-text";
import { startExactAmounts } from "@/lib/exact-amount";
import { startDomTranslate } from "@/lib/dom-translate";
import { GlobalShopBot } from "@/components/shopbook/business-assistant";
import { AuthShell } from "@/components/shopbook/auth-shell";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { Toaster } from "@/components/ui/sonner";
import { supabase } from "@/integrations/supabase/client";
import { store } from "@/lib/shopbook";
import { captureReferral, sendReferral } from "@/components/shopbook/daily-tools";
import { expireMigratedOwnerSession } from "@/lib/auth-service";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: ErrorComponentProps) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { title: "DataQuill Solutions" },
      // iPhone home-screen app: full screen, glass runs behind a translucent status bar.
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
      { name: "apple-mobile-web-app-title", content: "DataQuill Solutions" },
      { name: "theme-color", content: "oklch(0.14 0.04 265)", media: "(prefers-color-scheme: dark)" },
      { name: "theme-color", content: "#fff5e8", media: "(prefers-color-scheme: light)" },
      { name: "description", content: "DataQuill Solutions — the all-in-one ERP for small shops and businesses." },
      { property: "og:title", content: "DataQuill Solutions" },
      { property: "og:description", content: "The all-in-one ERP for small shops and businesses." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&display=optional" },
      { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Roboto+Condensed:wght@500;600;700&display=swap" },
      {
        rel: "stylesheet",
        href: appCss,
      },
      { rel: "icon", type: "image/png", href: "/favicon.png" },
      { rel: "apple-touch-icon", href: "/apple-touch-icon.png" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="dark">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const router = useRouter();
  useEffect(() => { applyUiSize(); applySettings(); window.addEventListener("resize", applyUiSize); return () => window.removeEventListener("resize", applyUiSize); }, []);
  // The account pages have a size floor (prefs.ts), so the zoom is worked out again whenever the page changes.
  const pathname = useRouterState({ select: (st) => st.location.pathname });
  useEffect(() => { applyUiSize(); }, [pathname]);
  // Phones and iPads show the laptop layout, shrunk to the screen (laptop-view.ts); re-checked when the device turns.
  useBeforePaint(() => { const f = () => { applyLaptopView(pathname); applyUiSize(); }; f(); window.addEventListener("orientationchange", f); window.screen.orientation?.addEventListener?.("change", f); return () => { window.removeEventListener("orientationchange", f); window.screen.orientation?.removeEventListener?.("change", f); }; }, [pathname]);
  useEffect(() => startCloudBackup(), []);
  useEffect(() => startConnectivity(), []);
  useEffect(() => startAutoSnapshots(), []);
  useEffect(() => startAutoLocalBackups(), []);
  useEffect(() => startShopSync(), []);
  useEffect(() => startFitText(), []);
  useEffect(() => startExactAmounts(), []);
  // Translates any known phrase a screen printed without tr(), on every page (src/lib/dom-translate.ts).
  useEffect(() => startDomTranslate(), []);
  // WhatsApp and SMS links send a PDF (src/lib/share-pdf.ts).
  useEffect(() => startPdfSharing(), []);
  // Floating ShopBot and the sample-shop bar go back to their starting place when another page opens (owner, 2026-11-26).
  useEffect(() => { window.dispatchEvent(new Event("dq-floating-home")); }, [pathname]);
  const isAuthRoute = pathname === "/" || pathname === "/signup";
  useEffect(() => {
    // Invite a shop, get a free month: a code from /signup?ref= is recorded once the new owner is signed in online.
    captureReferral(); void sendReferral().catch(() => undefined);
    const auth = supabase.auth.onAuthStateChange((event, session) => {
      if (session) void sendReferral().catch(() => undefined);
      const account = store.get();
      if (account?.staff) return; // StaffGate/session monitor performs server access checks and queue-safe cleanup.
      const expired = event === "SIGNED_OUT" || (event === "INITIAL_SESSION" && !session);
      if (!expired || account?.authMigration?.status !== "complete" || !store.signedIn()) return;
      expireMigratedOwnerSession();
      if (!["/", "/signup", "/auth/recovery", "/auth/verify", "/auth/return", "/terms", "/privacy", "/welcome"].includes(pathname) && !pathname.startsWith("/shop/")) void router.navigate({ to: "/", replace: true });
    });
    return () => auth.data.subscription.unsubscribe();
  }, [pathname, router]);

  return (
    <QueryClientProvider client={queryClient}>
      <StaffGate />
      <AppAccessGate />
      <FirstTimeHint />
      <AutoSummary />
      <SampleShopBar />
      <OnePageFit />
      <IdleLogout />
      {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
      {/* ERP workspace: plain pass-through until ShopBot docks on the right, then it holds the remaining width. */}
      <div className="shopbot-workspace"><div className="shopbot-workspace-scroll">
        {isAuthRoute ? <AuthShell><Outlet /></AuthShell> : <Outlet />}
      </div></div>
      {/* One ShopBot for every signed-in page; it floats above the page and never changes its layout. */}
      <GlobalShopBot />
      <Toaster position="top-center" />
    </QueryClientProvider>
  );
}
