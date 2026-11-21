// After Create Account: the online account needs its email verified before it can be used on other devices and linked to the
// business. This page says so plainly, shows the address, lets the owner send the link again, and lets them carry on setting up
// on this device meanwhile (the business works on this device whether or not the email is verified yet).
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, MailCheck } from "lucide-react";
import { useLanguage } from "@/hooks/use-language";
import { authMessage, resendVerification } from "@/lib/auth-service";
import { ShopButton } from "@/components/ui/shop-button";
import { ZakrioMark, useSavedTheme } from "@/components/shopbook/ui";

export const Route = createFileRoute("/auth/verify")({
  head: () => ({ meta: [{ title: "Verify your email — Zakrio Systems" }] }),
  validateSearch: (s: Record<string, unknown>) => ({ email: typeof s["email"] === "string" ? s["email"] : "" }),
  component: VerifyEmail,
});

const WAIT = 60;

function VerifyEmail() {
  const { tr } = useLanguage(), nav = useNavigate();
  useSavedTheme();
  const { email } = Route.useSearch();
  const [left, setLeft] = useState(WAIT);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  useEffect(() => { if (left <= 0) return; const t = window.setTimeout(() => setLeft((n) => n - 1), 1000); return () => window.clearTimeout(t); }, [left]);

  const resend = async () => {
    setBusy(true); setError(""); setMessage("");
    try { await resendVerification(email); setMessage(tr("A new link is on its way. Check your inbox and spam folder.")); setLeft(WAIT); }
    catch (e) { setError(authMessage(e)); }
    finally { setBusy(false); }
  };

  return <main className="app-screen signup-page legal-page verify-page readable-page">
    <section className="auth-card verify-card readable-card">
      <div className="verify-icon"><MailCheck aria-hidden /></div>
      <h1>{tr("Verify your email")}</h1>
      <p>{tr("We sent a verification link to")}</p>
      <p className="verify-email">{email || "—"}</p>
      <p>{tr("Open the link in that email to finish your online account. After that you can sign in on any phone or computer, and reset your password if you forget it.")}</p>
      <p className="verify-note">{tr("You can keep setting up now. Confirm your email later to log in from other phones or computers.")}</p>
      <div className="verify-actions">
        <ShopButton className="verify-go" onClick={() => nav({ to: "/plans" })}>{tr("Continue to plans")}</ShopButton>
        <ShopButton variant="outline" disabled={busy || left > 0 || !email} onClick={() => void resend()}>{left > 0 ? `${tr("Resend email")} (${left}s)` : tr("Resend email")}</ShopButton>
      </div>
      {message && <p role="status" className="verify-ok">{message}</p>}
      {error && <p role="alert" className="verify-err">{tr(error)}</p>}
      <p className="verify-small">{tr("Wrong email address? Contact Support from inside the app after you continue.")}</p>
      <p className="verify-brand"><ZakrioMark compact /> <b>ZAKRIO SYSTEMS</b></p>
      <Link to="/" className="verify-small readable-back"><ArrowLeft aria-hidden /> {tr("Back to login")}</Link>
    </section>
  </main>;
}
