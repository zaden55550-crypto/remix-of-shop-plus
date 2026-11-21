import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useLanguage } from "@/hooks/use-language";
import { supabase } from "@/integrations/supabase/client";
import { authMessage, finishOwnerRecovery, requestOwnerRecovery } from "@/lib/auth-service";
import { ShopButton } from "@/components/ui/shop-button";
import { ZakrioMark } from "@/components/shopbook/ui";
import { KeyRound } from "lucide-react";

export const Route = createFileRoute("/auth/recovery")({ component: OwnerRecovery });

function OwnerRecovery() {
  const { tr } = useLanguage();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [session, setSession] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    const refresh = () => void supabase.auth.getSession().then(({ data }) => setSession(Boolean(data.session)));
    refresh(); const auth = supabase.auth.onAuthStateChange(refresh);
    return () => auth.data.subscription.unsubscribe();
  }, []);

  const request = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setError(""); setMessage("");
    try { await requestOwnerRecovery(email); setMessage(tr("If that email has an account, a reset link is on its way. Check your inbox and spam folder.")); }
    catch (x) { setError(authMessage(x)); }
    finally { setBusy(false); }
  };
  const update = async (e: React.FormEvent) => {
    e.preventDefault(); setError(""); setMessage("");
    if (password.length < 6) { setError(tr("Password must be at least 6 characters")); return; }
    if (password !== confirm) { setError(tr("Passwords do not match.")); return; }
    setBusy(true);
    try { await finishOwnerRecovery(password); setMessage(tr("Password saved. Log in with your new password.")); setPassword(""); setConfirm(""); await supabase.auth.signOut({ scope: "local" }); setSession(false); }
    catch (x) { setError(authMessage(x)); }
    finally { setBusy(false); }
  };
  return <main className="app-screen signup-page legal-page verify-page"><section className="auth-card verify-card">
    <div className="verify-icon"><KeyRound aria-hidden /></div>
    <h1>{tr(session ? "Choose a new password" : "Forgot your password?")}</h1>
    {session ? <form className="recovery-form" onSubmit={(e) => void update(e)}>
      <p>{tr("Your email is confirmed. Type your new password twice.")}</p>
      <label className="inventory-field"><span>{tr("New password")}</span><input className="inventory-input" type="password" autoComplete="new-password" required value={password} onChange={(e) => setPassword(e.target.value)} /></label>
      <label className="inventory-field"><span>{tr("Confirm password")}</span><input className="inventory-input" type="password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} /></label>
      <div className="verify-actions"><ShopButton type="submit" className="verify-go" disabled={busy}>{tr("Save new password")}</ShopButton></div>
    </form> : <form className="recovery-form" onSubmit={(e) => void request(e)}>
      <p>{tr("Type the email you use to log in. We'll send a link to reset your password; it works on any phone or computer.")}</p>
      <label className="inventory-field"><span>{tr("Email")}</span><input className="inventory-input" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@gmail.com" /></label>
      <div className="verify-actions"><ShopButton type="submit" className="verify-go" disabled={busy}>{tr("Send reset link")}</ShopButton></div>
    </form>}
    {message && <p role="status" className="verify-ok">{message}</p>}{error && <p role="alert" className="verify-err">{tr(error)}</p>}
    <p className="verify-brand"><ZakrioMark compact /> <b>ZAKRIO SYSTEMS</b></p>
    <Link to="/" className="verify-small">{tr("Back to login")}</Link>
  </section></main>;
}
