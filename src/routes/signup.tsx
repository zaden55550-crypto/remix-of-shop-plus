import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Lock, Mail, Store } from "lucide-react";
import { toast } from "sonner";
import { BrandRing, Field, LogoPicker, TopBar } from "@/components/shopbook/ui";
import { ShopButton } from "@/components/ui/shop-button";
import { useLanguage } from "@/hooks/use-language";
import { store } from "@/lib/shopbook";

export const Route = createFileRoute("/signup")({
  head: () => ({
    meta: [
      { title: "Create Account — SHOPBOOK ERP" },
      { name: "description", content: "Create your SHOPBOOK shop account in under a minute. No verification needed." },
      { property: "og:title", content: "Create Account — SHOPBOOK ERP" },
      { property: "og:description", content: "Create your SHOPBOOK shop account." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Signup,
});

function Signup() {
  const nav = useNavigate();
  const { tr, t, dir, language } = useLanguage();
  const [f, setF] = useState({ shopName: "", email: "", password: "", confirm: "", currency: "KSh", logo: "" });
  const [agree, setAgree] = useState(false);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (f.password.length < 6) { toast.error(tr("Password must be at least 6 characters")); return; }
    if (f.password !== f.confirm) { toast.error(tr("Passwords do not match")); return; }
    if (!agree) { toast.error(tr("Please accept the Terms & Privacy Policy")); return; }
    store.save({ language, shopName: f.shopName.trim(), email: f.email.trim(), password: f.password, currency: f.currency, logo: f.logo || undefined });
    store.signIn();
    nav({ to: "/plans" });
  };

  return (
    <main dir={dir} className="app-screen pb-8">
      <TopBar />
      <div className="mt-3"><BrandRing size={180} /></div>
      <div className="mt-3"><LogoPicker value={f.logo} onChange={(logo) => setF({ ...f, logo })} /></div>
      <h1 className="mt-2 text-center text-2xl font-bold">{tr("Create Your Account")}</h1>
      <form onSubmit={submit} className="mt-4 space-y-2.5 px-5">
        <Field icon={<Store className="h-5 w-5" />} placeholder={tr("Shop Name")} value={f.shopName} onChange={set("shopName")} required />
        <Field icon={<Mail className="h-5 w-5" />} type="email" placeholder={tr("Email")} value={f.email} onChange={set("email")} required />
        <Field icon={<Lock className="h-5 w-5" />} password placeholder={tr("Password")} value={f.password} onChange={set("password")} required />
        <Field icon={<Lock className="h-5 w-5" />} password placeholder={tr("Confirm Password")} value={f.confirm} onChange={set("confirm")} required />
        <select value={f.currency} onChange={set("currency")}
          className="h-12 w-full rounded-xl border border-input bg-card px-3.5 font-medium outline-none focus:border-primary">
          <option value="KSh">KSh – {tr("Kenyan Shilling")}</option>
          <option value="USh">USh – {tr("Ugandan Shilling")}</option>
          <option value="TSh">TSh – {tr("Tanzanian Shilling")}</option>
          <option value="USD">USD – {tr("US Dollar")}</option>
        </select>
        <label className="flex items-start gap-2 pt-1 text-sm">
          <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-0.5 h-4 w-4 accent-primary" />
          {tr("I agree to the Terms & Conditions and Privacy Policy")}
        </label>
        <ShopButton type="submit">{tr("Create Account")} →</ShopButton>
        <p className="pt-1 text-center text-sm">{tr("Already have an account?")} <Link to="/" className="font-semibold text-primary">{tr("Log In")}</Link></p>
      </form>
    </main>
  );
}
