import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Lock, Store } from "lucide-react";
import { toast } from "sonner";
import { BrandRing, Field, LogoPicker, TopBar } from "@/components/shopbook/ui";
import { ShopButton } from "@/components/ui/shop-button";
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
  const [id, setId] = useState("");
  const [pw, setPw] = useState("");
  const [remember, setRemember] = useState(true);
  const [logo, setLogo] = useState<string | undefined>();
  useEffect(() => setLogo(store.get()?.logo), []);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const a = store.get();
    const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, "");
    if (!a || (norm(a.shopName) !== norm(id) && norm(a.phone) !== norm(id)) || a.password !== pw) {
      toast.error("Shop name, phone or password is incorrect");
      return;
    }
    store.signIn();
    nav({ to: a.plan ? "/apps" : "/plans" });
  };

  return (
    <main className="app-screen pb-8">
      <TopBar />
      <div className="mt-4"><BrandRing /></div>
      <div className="mt-4"><LogoPicker value={logo} /></div>
      <h1 className="mt-3 text-center text-3xl font-bold">Login</h1>
      <p className="text-center text-sm text-muted-foreground">Sign in to your shop account</p>
      <form onSubmit={submit} className="mt-5 space-y-3 px-5">
        <Field icon={<Store className="h-5 w-5" />} placeholder="Shop Name or Phone" value={id} onChange={(e) => setId(e.target.value)} required />
        <Field icon={<Lock className="h-5 w-5" />} password placeholder="Password" value={pw} onChange={(e) => setPw(e.target.value)} required />
        <div className="flex items-center justify-between text-sm">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="h-4 w-4 accent-primary" /> Remember me
          </label>
          <button type="button" className="text-primary" onClick={() => toast("Ask your shop admin to reset your password.")}>Forgot Password?</button>
        </div>
        <ShopButton type="submit">Log In</ShopButton>
        <div className="flex items-center gap-3 text-xs text-muted-foreground"><span className="h-px flex-1 bg-border" />OR<span className="h-px flex-1 bg-border" /></div>
        <Link to="/signup" className="block"><ShopButton type="button" variant="outline">Create Account</ShopButton></Link>
      </form>
    </main>
  );
}
