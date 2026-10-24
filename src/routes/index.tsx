import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Lock, Store } from "lucide-react";
import { toast } from "sonner";
import { BrandRing, Field, SocialButtons, TopBar } from "@/components/shopbook/ui";
import { ShopButton } from "@/components/ui/shop-button";
import { useLanguage } from "@/hooks/use-language";
import { store } from "@/lib/shopbook";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Log in — SHOPBOOK ERP" },
      { name: "description", content: "Sign in to your SHOPBOOK shop account to run sales, stock and accounts." },
      { property: "og:title", content: "Log in — SHOPBOOK ERP" },
      { property: "og:description", content: "Sign in to your SHOPBOOK shop account." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Login,
});

function Login() {
  const nav = useNavigate();
  const { tr, t, dir, language } = useLanguage();
  const [id, setId] = useState("");
  const [pw, setPw] = useState("");
  const [remember, setRemember] = useState(true);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const a = store.get();
    const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, "");
    if (!a || (norm(a.shopName) !== norm(id) && norm(a.phone || "") !== norm(id)) || a.password !== pw) {
      toast.error(tr("Shop name, phone number or password is incorrect"));
      return;
    }
    store.signIn();
    nav({ to: a.plan ? "/apps" : "/plans" });
  };

  return (
    <main dir={dir} className="app-screen signup-page auth-login">
      <div className="signup-topbar"><TopBar /></div>
      <div className="signup-layout">
        <section className="signup-hero" aria-label="SHOPBOOK ERP">
          <div className="signup-brand-ring"><BrandRing size={180} /></div>
        </section>
        <section className="signup-form-panel">
          <header className="signup-form-heading">
            <h1>{tr("Log In")}</h1>
            <p>{tr("Sign in to your shop account")}</p>
          </header>
          <form onSubmit={submit} className="signup-form">
            <div className="login-fields">
              <Field icon={<Store className="h-5 w-5" />} label={tr("Shop Name or Phone Number")} placeholder={tr("Enter shop name or phone number")} autoComplete="username" value={id} onChange={(e) => setId(e.target.value)} required />
              <Field icon={<Lock className="h-5 w-5" />} password label={tr("Password")} placeholder={tr("Enter your password")} autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} required />
            </div>
            <div className="signup-agreement login-row">
              <label className="signup-agreement-label">
                <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} /> <span>{tr("Remember me")}</span>
              </label>
              <button type="button" className="login-forgot" onClick={() => toast(tr("Ask your shop admin to reset your password."))}>{tr("Forgot Password?")}</button>
            </div>
            <div className="signup-actions">
              <ShopButton type="submit">{tr("Log In")}</ShopButton>
              <SocialButtons />
              <p className="signup-login-link">{tr("Don't have an account?")} <Link to="/signup">{tr("Create Account")}</Link></p>
            </div>
          </form>
        </section>
      </div>
    </main>
  );
}
