import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Lock, Phone, Store, ShieldCheck, MonitorSmartphone, BriefcaseBusiness } from "lucide-react";
import { toast } from "sonner";
import { BrandRing, Field, LogoCropPicker, SocialButtons, TopBar } from "@/components/shopbook/ui";
import { ShopButton } from "@/components/ui/shop-button";
import { useLanguage } from "@/hooks/use-language";
import { store } from "@/lib/shopbook";

export const Route = createFileRoute("/signup")({
  head: () => ({
    meta: [
      { title: "Create Account — SHOPBOOK ERP" },
      {
        name: "description",
        content: "Create your SHOPBOOK shop account in under a minute. No verification needed.",
      },
      { property: "og:title", content: "Create Account — SHOPBOOK ERP" },
      {
        property: "og:description",
        content: "Create your SHOPBOOK shop account.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Signup,
});

function Signup() {
  const nav = useNavigate();
  const { tr, dir, language } = useLanguage();

  const [f, setF] = useState({
    shopName: "",
    phone: "",
    password: "",
    confirm: "",
    currency: "KSh",
    logo: "",
  });

  const [agree, setAgree] = useState(false);
  const [err, setErr] = useState<{
    password?: string;
    confirm?: string;
    agree?: string;
  }>({});

  const set = (k: keyof typeof f) => (e: { target: { value: string } }) =>
    setF((previous) => ({ ...previous, [k]: e.target.value }));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();

    const next: typeof err = {};

    if (f.password.length < 6) {
      next.password = tr("Password must be at least 6 characters");
    } else if (f.password !== f.confirm) {
      next.confirm = tr("Passwords do not match");
    }

    if (!agree) {
      next.agree = tr("Please accept the Terms & Privacy Policy");
    }

    setErr(next);

    const first = next.password || next.confirm || next.agree;

    if (first) {
      toast.error(first);
      return;
    }

    try {
      store.save({
        language,
        shopName: f.shopName.trim(),
        phone: f.phone.trim(),
        email: "",
        password: f.password,
        currency: f.currency,
        logo: f.logo || undefined,
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tr("Could not create account"));
      return;
    }

    store.signIn();
    nav({ to: "/plans" });
  };

  const benefits = [
    {
      icon: BriefcaseBusiness,
      title: "All-in-One",
      description: "Business Management",
    },
    {
      icon: ShieldCheck,
      title: "Secure",
      description: "and Reliable",
    },
    {
      icon: MonitorSmartphone,
      title: "Works on All",
      description: "Your Devices",
    },
  ];

  return (
    <main dir={dir} className="app-screen signup-page">
      <div className="signup-topbar">
        <TopBar />
      </div>

      <div className="signup-layout">
        <section className="signup-hero" aria-label="SHOPBOOK ERP">
          <div className="signup-brand-ring">
            <BrandRing size={180} />
          </div>

          <div className="signup-hero-brand">
            <span>SHOPBOOK</span>
            <span>ERP</span>
          </div>

          <div className="signup-benefits">
            {benefits.map(({ icon: Icon, title, description }) => (
              <div className="signup-benefit" key={title}>
                <span className="signup-benefit-icon">
                  <Icon aria-hidden="true" />
                </span>
                <span className="signup-benefit-copy">
                  <strong>{tr(title)}</strong>
                  <span>{tr(description)}</span>
                </span>
              </div>
            ))}
          </div>
        </section>

        <section className="signup-form-panel">
          <header className="signup-form-heading">
            <h1>{tr("Create Your Account")}</h1>
            <p>{tr("Set up your shop to get started with SHOPBOOK ERP")}</p>
          </header>

          <form onSubmit={submit} className="signup-form">
            <div className="signup-form-fields">
              <Field
                icon={<Store className="h-5 w-5" />}
                label={tr("Shop Name")}
                placeholder={tr("Enter your shop name")}
                value={f.shopName}
                onChange={set("shopName")}
                required
              />

              <Field
                icon={<Phone className="h-5 w-5" />}
                inputMode="tel"
                label={tr("Phone Number")}
                placeholder={tr("Enter your phone number")}
                type="tel"
                autoComplete="tel"
                value={f.phone}
                onChange={set("phone")}
                required
              />

              <div className="signup-upload">
                <LogoCropPicker value={f.logo} onChange={(logo) => setF((previous) => ({ ...previous, logo }))} />
              </div>

              <Field
                icon={<Lock className="h-5 w-5" />}
                password
                label={tr("Password")}
                placeholder={tr("Create a password")}
                autoComplete="new-password"
                error={err.password}
                value={f.password}
                onChange={set("password")}
                required
              />

              <Field
                icon={<Lock className="h-5 w-5" />}
                password
                label={tr("Confirm Password")}
                placeholder={tr("Re-enter your password")}
                autoComplete="new-password"
                error={err.confirm}
                value={f.confirm}
                onChange={set("confirm")}
                required
              />

              <div className="signup-currency">
                <label htmlFor="signup-currency" className="signup-field-label">
                  {tr("Currency")}
                </label>

                <select
                  id="signup-currency"
                  value={f.currency}
                  onChange={set("currency")}
                  className="signup-currency-select"
                >
                  <option value="KSh">KSh – {tr("Kenyan Shilling")}</option>
                  <option value="USh">USh – {tr("Ugandan Shilling")}</option>
                  <option value="TSh">TSh – {tr("Tanzanian Shilling")}</option>
                  <option value="USD">USD – {tr("US Dollar")}</option>
                </select>
              </div>
            </div>

            <div className="signup-agreement">
              <label className="signup-agreement-label">
                <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
                <span>{tr("I agree to the Terms & Conditions and Privacy Policy")}</span>
              </label>

              {err.agree && (
                <p role="alert" className="signup-error">
                  {err.agree}
                </p>
              )}
            </div>

            <div className="signup-actions">
              <ShopButton type="submit">{tr("Create Account")} →</ShopButton>
              <SocialButtons />

              <p className="signup-login-link">
                {tr("Already have an account?")} <Link to="/">{tr("Log In")}</Link>
              </p>
            </div>
          </form>
        </section>
      </div>
    </main>
  );
}
