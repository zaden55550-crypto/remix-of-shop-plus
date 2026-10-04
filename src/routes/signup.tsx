import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Lock, Store } from "lucide-react";
import { toast } from "sonner";
import { BrandRing, Field, LogoPicker, TopBar } from "@/components/shopbook/ui";
import { ShopButton } from "@/components/ui/shop-button";
import { store } from "@/lib/shopbook";

export const Route = createFileRoute("/signup")({
  head: () => ({
    meta: [
      { title: "Create Account — SHOPBOOK ERP" },
      { name: "description", content: "Create your SHOPBOOK shop account in under a minute. No verification needed." },
      { property: "og:title", content: "Create Account — SHOPBOOK ERP" },
      { property: "og:description", content: "Create your SHOPBOOK shop account." },
    ],
  }),
  component: Signup,
});

function Signup() {
  const nav = useNavigate();
  const [f, setF] = useState({ shopName: "", phone: "", password: "", confirm: "", currency: "KSh", logo: "" });
  const [agree, setAgree] = useState(false);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (f.password.length < 6) { toast.error("Password must be at least 6 characters"); return; }
    if (f.password !== f.confirm) { toast.error("Passwords do not match"); return; }
    if (!agree) { toast.error("Please accept the Terms & Privacy Policy"); return; }
    store.save({ shopName: f.shopName.trim(), phone: f.phone.trim(), password: f.password, currency: f.currency, logo: f.logo || undefined });
    store.signIn();
    nav({ to: "/plans" });
  };

  return (
    <main className="app-screen pb-8">
      <TopBar />
      <div className="mt-3"><BrandRing size={180} /></div>
      <div className="mt-3"><LogoPicker value={f.logo} onChange={(logo) => setF({ ...f, logo })} /></div>
      <h1 className="mt-2 text-center text-2xl font-bold">Create Your Account</h1>
      <form onSubmit={submit} className="mt-4 space-y-2.5 px-5">
        <Field icon={<Store className="h-5 w-5" />} placeholder="Shop Name" value={f.shopName} onChange={set("shopName")} required />
        <div className="flex gap-2">
          <div className="flex h-12 w-20 items-center justify-center rounded-xl border border-input bg-card/40 font-medium">+254</div>
          <Field className="flex-1" type="tel" inputMode="tel" placeholder="Phone Number" value={f.phone} onChange={set("phone")} required />
        </div>
        <Field icon={<Lock className="h-5 w-5" />} password placeholder="Password" value={f.password} onChange={set("password")} required />
        <Field icon={<Lock className="h-5 w-5" />} password placeholder="Confirm Password" value={f.confirm} onChange={set("confirm")} required />
        <select value={f.currency} onChange={set("currency")}
          className="h-12 w-full rounded-xl border border-input bg-card px-3.5 font-medium outline-none focus:border-primary">
          <option value="KSh">KSh – Kenyan Shilling</option>
          <option value="USh">USh – Ugandan Shilling</option>
          <option value="TSh">TSh – Tanzanian Shilling</option>
          <option value="USD">USD – US Dollar</option>
        </select>
        <label className="flex items-start gap-2 pt-1 text-sm">
          <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-0.5 h-4 w-4 accent-primary" />
          I agree to the Terms & Conditions and Privacy Policy
        </label>
        <ShopButton type="submit">Create Account →</ShopButton>
        <p className="pt-1 text-center text-sm">Already have an account? <Link to="/" className="font-semibold text-primary">Log In</Link></p>
      </form>
    </main>
  );
}
