// The account layout shared by Log In (/) and Create Account (/signup). One DOM serves two presentations, chosen by CSS only
// (so server rendering never shows the wrong one first):
// - Below 1100px wide (phones, tablets): the earlier layout, unchanged: `.signup-layout` with the artwork hero and the
//   form panel, styled by the original signup/login rules; the welcome panel is display:none (never focusable).
// - From 1100px wide: the same wrapper becomes the two-half sliding card (AUTH SLIDING CARD in styles.css). The hero and the form's
//   phone-only switch card are hidden; the welcome half ("Hello there" + Sign Up, or "Welcome back" + Log In) slides between sides
//   when the mode changes (instant with reduced motion).
// The two modes stay separate routes, so direct links, refresh and Back/Forward keep working, and only one form exists.
import { useEffect, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { BriefcaseBusiness, WalletCards, WifiOff } from "lucide-react";
import { BrandRing } from "@/components/shopbook/ui";
import { useLanguage } from "@/hooks/use-language";
import { cn } from "@/lib/utils";

export type AuthMode = "login" | "signup";

/** Where the welcome half was when the last card left the page (in memory only: a fresh load starts in place, no slide). */
let lastSide: AuthMode | null = null;

export function AuthCard({ mode, children }: { mode: AuthMode; children: ReactNode }) {
  const { tr } = useLanguage();
  // Start where the previous mode left the panel, then move it to this mode's side on the next frames, so CSS animates the move.
  const [side, setSide] = useState<AuthMode>(() => lastSide ?? mode);
  useEffect(() => {
    lastSide = mode;
    if (side === mode) return;
    let second = 0;
    const first = requestAnimationFrame(() => { second = requestAnimationFrame(() => setSide(mode)); });
    return () => { cancelAnimationFrame(first); cancelAnimationFrame(second); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  const login = mode === "login";
  return (
    <div className={cn("signup-layout auth-card", `panel-${side}`)} data-mode={mode}>
      <section className="signup-hero" aria-label="Zakrio Systems">
        <div className="signup-brand-ring">
          <BrandRing size={180} />
        </div>
      </section>
      <section className="signup-form-panel auth-card-form">
        {children}
      </section>
      <aside className="auth-card-welcome" aria-label="Zakrio Systems">
        <div className="auth-card-art">
          <BrandRing size={220} />
        </div>
        <h2 className="auth-card-greeting">{tr(login ? "Hello there" : "Welcome back")}</h2>
        <p className="auth-card-note">{tr(login ? "New to Zakrio Systems? Create your business account." : "Already have an account? Log in to your business.")}</p>
        {/* Switches mode only: a link outside the form, so it can never submit it. */}
        <Link to={login ? "/signup" : "/"} className="auth-switch-btn">
          {tr(login ? "Sign Up" : "Log In")}
        </Link>
      </aside>
    </div>
  );
}

const BENEFITS = [
  { icon: WifiOff, title: "Works Offline", description: "Keep selling without internet" },
  { icon: BriefcaseBusiness, title: "All in One", description: "Sales, stock and accounts" },
  { icon: WalletCards, title: "Every Payment", description: "Cash, mobile money and bank" },
];

/** The three benefit cards, shared by Log In and Create Account. They sit outside the card, so they stay still while the welcome
 *  panel slides. Same markup and classes as the earlier Log In row, so its phone layout is unchanged; phones show no row on
 *  Create Account, as before (AUTH SLIDING CARD in styles.css). */
export function AuthBenefits() {
  const { tr } = useLanguage();
  return (
    <div className="login-benefits-footer auth-benefits" aria-label="Zakrio Systems benefits">
      {BENEFITS.map((b, i) => (
        <div key={i} className="signup-benefit">
          <div className="signup-benefit-icon">
            <b.icon className="h-4 w-4" />
          </div>
          <div className="signup-benefit-text">
            <h3>{tr(b.title)}</h3>
            <p>{tr(b.description)}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
