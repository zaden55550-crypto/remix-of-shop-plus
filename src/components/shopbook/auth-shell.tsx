import { useEffect, useLayoutEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useRouterState } from "@tanstack/react-router";
import { TopBar } from "@/components/shopbook/ui";
import { BrandRing } from "@/components/shopbook/ui";
import { AuthBenefits } from "@/components/shopbook/auth-card";
import { useLanguage } from "@/hooks/use-language";
import { LangQuick, Testimonials } from "@/components/shopbook/try-and-tour";
import { cn } from "@/lib/utils";

export type AuthMode = "login" | "signup";

/** Where the welcome panel was when the last mode change finished (in memory only). */
let lastSide: AuthMode | null = null;

/** Delay for the established tablet/phone content slide (matches AUTH SLIDE in styles.css). */
const LEAVE_MS = 240;
const DESKTOP_PANEL_MS = 560;
const ROUTE_ENTER_MS = 380;

function useAuthMode(): AuthMode {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return pathname === "/signup" ? "signup" : "login";
}

/** Every screen size slides the card's contents out before switching, unless the device asks for reduced motion. */
function canSlide(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Persistent shared auth shell for Log In (/) and Create Account (/signup).
 *
 * The outer glass card and the welcome panel live here, so a route change between the two
 * modes never remounts them: the welcome panel slides across the card on a transform while
 * the form half swaps through the Outlet. Direct loading, refresh and Back/Forward keep the
 * correct finished state because the shell reads the mode from the route, not from state.
 *
 * Phones keep one blue-glass form panel, the rotating logo ring, a separate account-switch strip and benefit badges below.
 * On wide screens the welcome half glides across the still-mounted glass card while the other route's form is revealed beneath it.
 * Tablets and phones retain the established `data-leave` / `data-enter` content slide from AUTH SLIDE in styles.css.
 */
export function AuthShell({ children }: { children: ReactNode }) {
  const { tr, dir } = useLanguage();
  const navigate = useNavigate();
  // The root keeps this shell mounted between / and /signup. Only the route's form content
  // changes; the page background, glass card, top bar and benefit badges stay in place.
  const mode = useAuthMode();
  const login = mode === "login";
  const [side, setSide] = useState<AuthMode>(() => lastSide ?? mode);
  const [welcomeMode, setWelcomeMode] = useState<AuthMode>(mode);
  const [enter, setEnter] = useState<AuthMode | null>(null);
  const [leave, setLeave] = useState<AuthMode | null>(null);
  const leaveTimer = useRef(0);
  const enterTimer = useRef(0);
  const welcomeTimer = useRef(0);
  const previousMode = useRef(mode);

  useLayoutEffect(() => {
    if (previousMode.current === mode) return;
    const from = previousMode.current;
    previousMode.current = mode;
    window.clearTimeout(leaveTimer.current);
    window.clearTimeout(enterTimer.current);
    window.clearTimeout(welcomeTimer.current);
    setLeave(null);
    setSide(mode);
    lastSide = mode;

    if (!canSlide()) {
      setEnter(null);
      setWelcomeMode(mode);
      return;
    }

    setEnter(mode);
    if (window.matchMedia("(min-width: 1100px)").matches) {
      // Keep the old welcome copy on the moving panel. It changes only after the panel
      // reaches its new side, while the new route's form is uncovered underneath it.
      setWelcomeMode(from);
      welcomeTimer.current = window.setTimeout(() => {
        setWelcomeMode(mode);
        setEnter(null);
      }, DESKTOP_PANEL_MS);
    } else {
      setWelcomeMode(mode);
      enterTimer.current = window.setTimeout(() => setEnter(null), ROUTE_ENTER_MS);
    }
  }, [mode]);

  useEffect(() => () => {
    window.clearTimeout(leaveTimer.current);
    window.clearTimeout(enterTimer.current);
    window.clearTimeout(welcomeTimer.current);
  }, []);

  const welcomeLogin = welcomeMode === "login";
  const target = welcomeLogin ? "/signup" : "/";
  const onSwitch = (e: MouseEvent<HTMLAnchorElement>) => {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || !canSlide()) return;
    e.preventDefault();
    if (leave || welcomeMode !== mode) return;

    // At big-screen widths the shared shell stays mounted and the welcome half itself
    // crosses the glass card. Tablets and phones retain their established content slide.
    if (window.matchMedia("(min-width: 1100px)").matches) {
      void navigate({ to: target });
      return;
    }

    setLeave(login ? "signup" : "login");
    leaveTimer.current = window.setTimeout(() => { void navigate({ to: target }); }, LEAVE_MS);
  };

  return (
    <main dir={dir} className={cn("app-screen signup-page auth-split-page", `auth-${mode}`)}>
      <div className="signup-topbar">
        <LangQuick />
        <TopBar />
      </div>

      <div
        className={cn("signup-layout auth-card", `panel-${side}`)}
        data-mode={mode}
        data-enter={enter ?? undefined}
        data-leave={leave ?? undefined}
        data-transitioning={welcomeMode !== mode ? "true" : undefined}
      >
        <aside className="auth-card-welcome" aria-label="DataQuill Solutions">
          <div className="auth-card-art">
            <BrandRing size={220} />
          </div>
          <div className="auth-card-words">
            <h2 className="auth-card-greeting">{tr(welcomeLogin ? "Hello there" : "Welcome back")}</h2>
            <p className="auth-card-note">{tr(welcomeLogin ? "New to DataQuill Solutions? Create your business account." : "Already have an account? Log in to your business.")}</p>
            <Link to={target} className="auth-switch-btn" onClick={onSwitch}>
              {tr(welcomeLogin ? "Sign Up" : "Log In")}
            </Link>
          </div>
        </aside>

        <section className="signup-form-panel auth-card-form">
          {/* Phones: the same rotating logo as the laptop's welcome panel, at the top of the card. */}
          <div className="auth-phone-brand auth-phone-ring" aria-label="DataQuill Solutions">
            <BrandRing size={112} />
          </div>
          {children}
        </section>
      </div>
      <div className="auth-phone-switch">
        <span className="auth-phone-switch-label">{tr(login ? "Don't have an account?" : "Already have an account?")}</span>
        <Link to={target} className="auth-phone-switch-link" onClick={onSwitch}>
          {tr(login ? "Sign Up" : "Log In")}
        </Link>
      </div>
      <AuthBenefits />
      <Testimonials />
    </main>
  );
}
