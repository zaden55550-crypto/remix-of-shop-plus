// Where the email-verification link (and any online sign-in that returns by link) lands. The sign-in library reads the link
// itself; this page waits for the online session, says so, and hands over to Log In, which opens the right business (or
// downloads it on a new device). An expired or already-used link is said plainly, with a way back.
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { MailCheck } from "lucide-react";
import { useLanguage } from "@/hooks/use-language";
import { supabase } from "@/integrations/supabase/client";
import { ZakrioMark } from "@/components/shopbook/ui";

export const Route = createFileRoute("/auth/return")({
  head: () => ({ meta: [{ title: "Signing in — DataQuill Solutions" }] }),
  component: AuthReturn,
});

function AuthReturn() {
  const { tr } = useLanguage(), nav = useNavigate();
  const [failed, setFailed] = useState("");
  useEffect(() => {
    let done = false;
    const go = () => { if (!done) { done = true; nav({ to: "/", replace: true }); } };
    const params = new URLSearchParams(window.location.hash.slice(1) || window.location.search);
    const linkError = params.get("error_description");
    if (linkError) { setFailed(linkError); return; }
    void supabase.auth.getSession().then(({ data }) => { if (data.session) go(); });
    const sub = supabase.auth.onAuthStateChange((_event, session) => { if (session) go(); });
    const timer = window.setTimeout(() => { if (!done) setFailed("This link has expired or was already used. Log in, or ask for a new link."); }, 10000);
    return () => { done = true; sub.data.subscription.unsubscribe(); window.clearTimeout(timer); };
  }, [nav]);

  return <main className="app-screen signup-page legal-page verify-page">
    <section className="auth-card verify-card">
      <div className="verify-icon"><MailCheck aria-hidden /></div>
      {failed ? <>
        <h1>{tr("This link didn't work")}</h1>
        <p role="alert">{tr(failed)}</p>
        <div className="verify-actions"><Link to="/" className="verify-go">{tr("Back to login")}</Link></div>
      </> : <>
        <h1>{tr("Email verified")}</h1>
        <p role="status">{tr("Opening your business…")}</p>
      </>}
      <p className="verify-brand"><ZakrioMark compact /> <b>DATAQUILL SOLUTIONS</b></p>
    </section>
  </main>;
}
