// The page an invitation or reset link opens. The token sits after the # so it never reaches server logs or other sites.
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Lock, Mail } from "lucide-react";
import { BrandRing, Field, TopBar } from "@/components/shopbook/ui";
import { ShopButton } from "@/components/ui/shop-button";
import { useLanguage } from "@/hooks/use-language";
import { acceptInvitation, invitationInfo } from "@/lib/people-access.functions";
import { roleLabel } from "@/lib/staff-access";

export const Route = createFileRoute("/invite")({
  head: () => ({ meta: [{ title: "Your invitation — DataQuill Solutions" }, { name: "robots", content: "noindex" }, { name: "referrer", content: "no-referrer" }] }),
  component: Invite,
});

type Info = Awaited<ReturnType<typeof invitationInfo>>;

function Invite() {
  const { tr, dir } = useLanguage();
  const nav = useNavigate();
  const [token, setToken] = useState("");
  const [info, setInfo] = useState<Info | null>(null);
  const [contact, setContact] = useState(""), [pw, setPw] = useState(""), [again, setAgain] = useState("");
  const [error, setError] = useState(""), [busy, setBusy] = useState(false), [done, setDone] = useState(false);

  useEffect(() => {
    const t = window.location.hash.slice(1);
    setToken(t);
    if (!/^[0-9a-f]{64}$/.test(t)) { setInfo({ valid: false }); return; }
    invitationInfo({ data: { token: t } }).then(setInfo).catch(() => setInfo({ valid: false }));
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pw.length < 8) { setError(tr("Use at least 8 characters for your password")); return; }
    if (pw !== again) { setError(tr("The two passwords don't match")); return; }
    setBusy(true); setError("");
    try {
      await acceptInvitation({ data: { token, contact, password: pw } });
      window.history.replaceState(null, "", "/invite");
      setDone(true);
    } catch (x) { setError(x instanceof Error ? tr(x.message) : tr("Something went wrong. Try again.")); }
    finally { setBusy(false); }
  };

  const reset = info?.kind === "reset";
  return <main dir={dir} className="app-screen signup-page auth-login">
    <div className="signup-topbar"><TopBar /></div>
    <div className="signup-layout">
      <section className="signup-hero" aria-label="DataQuill Solutions"><div className="signup-brand-ring"><BrandRing size={180} /></div></section>
      <section className="signup-form-panel">
        {!info ? <header className="signup-form-heading"><h1>{tr("Checking your invitation...")}</h1></header>
        : done ? <>
          <header className="signup-form-heading"><h1>{tr(reset ? "Password changed" : "Your account is ready")}</h1><p>{tr("Sign in with your phone number or email and your new password.")}</p></header>
          <ShopButton className="auth-btn-primary w-full" onClick={() => nav({ to: "/" })}>{tr("Go to Log In")}</ShopButton>
        </>
        : !info.valid ? <>
          <header className="signup-form-heading"><h1>{tr("This invitation can't be used")}</h1><p>{tr("It may have expired, been replaced or already been used. Ask your employer for a new one.")}</p></header>
          <ShopButton className="auth-btn-primary w-full" onClick={() => nav({ to: "/" })}>{tr("Go to Log In")}</ShopButton>
        </>
        : <>
          <header className="signup-form-heading">
            <h1>{tr(reset ? "Set a new password" : "Activate your account")}</h1>
            <p>{info.name} • {info.shop}{!reset && <> • {tr(roleLabel(info.role))}</>}</p>
          </header>
          <form onSubmit={submit} className="signup-form">
            <div className="login-fields">
              <Field icon={<Mail className="h-5 w-5" />} label={tr(info.usesEmail && info.usesPhone ? "Your phone number or email" : info.usesEmail ? "Your email" : "Your phone number")} placeholder={tr("The one your employer registered")} autoComplete="username" type="text" value={contact} onChange={(e) => setContact(e.target.value)} required />
              <Field icon={<Lock className="h-5 w-5" />} password label={tr("Create a password")} placeholder={tr("At least 8 characters")} autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} required />
              <Field icon={<Lock className="h-5 w-5" />} password label={tr("Confirm password")} placeholder={tr("Type it again")} autoComplete="new-password" value={again} onChange={(e) => setAgain(e.target.value)} required />
            </div>
            {error && <p role="alert" className="text-destructive text-sm">{error}</p>}
            <div className="signup-actions"><ShopButton type="submit" className="auth-btn-primary w-full" disabled={busy}>{tr(busy ? "Please wait..." : reset ? "Save new password" : "Accept and activate")}</ShopButton></div>
          </form>
        </>}
      </section>
    </div>
  </main>;
}
