import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Lock, Mail, Store, ShieldCheck, MonitorSmartphone, BriefcaseBusiness } from "lucide-react";
import { toast } from "sonner";
import {
  BrandRing,
  Field,
  LogoCropPicker,
  SearchableCurrencyPicker,
  SearchableCountryPicker,
  SocialButtons,
  TopBar,
} from "@/components/shopbook/ui";
import { ShopButton } from "@/components/ui/shop-button";
import { useLanguage } from "@/hooks/use-language";
import { store } from "@/lib/shopbook";
import { detectUserCountry } from "@/lib/world-data";

export const Route = createFileRoute("/signup")({
  head: () => ({
    meta: [
      { title: "Create Account — SHOPBOOK ERP" },
      {
        name: "description",
        content: "Create your free SHOPBOOK ERP shop account to manage sales, stock and accounts.",
      },
      { property: "og:title", content: "Create Account — SHOPBOOK ERP" },
      { property: "og:description", content: "Create your free SHOPBOOK ERP shop account." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Signup,
});

// Requires a real domain extension like .com, .co, .org, .net, .io, .ke, etc.
const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

function Signup() {
  const nav = useNavigate();
  const { tr, dir, language } = useLanguage();

  const [f, setF] = useState({
    shopName: "",
    email: "",
    password: "",
    confirm: "",
    currency: "KSH",
    country: "KEN",
    logo: "",
  });

  // Detect the visitor's country after the page appears, so server and browser agree.
  useEffect(() => {
    const detected = detectUserCountry();
    setF((prev) =>
      prev.currency === "KSH" && prev.country === "KEN"
        ? { ...prev, currency: detected.currencyCode, country: detected.countryCode }
        : prev,
    );
  }, []);

  const [agree, setAgree] = useState(false);
  const [err, setErr] = useState<{
    shopName?: string;
    email?: string;
    password?: string;
    confirm?: string;
    agree?: string;
  }>({});

  const set = (k: keyof typeof f) => (e: { target: { value: string } }) =>
    setF((previous) => ({ ...previous, [k]: e.target.value }));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();

    const next: typeof err = {};

    const shopTrimmed = f.shopName.trim();
    if (!shopTrimmed) {
      next.shopName = tr("Shop name is required");
    }

    const emailTrimmed = f.email.trim();
    if (!emailTrimmed) {
      next.email = tr("Email address is required");
    } else if (!EMAIL_REGEX.test(emailTrimmed)) {
      next.email = tr("Please enter a valid email address ending in .com, .co, etc. (e.g. name@gmail.com)");
    }

    if (f.password.length < 6) {
      next.password = tr("Password must be at least 6 characters");
    } else if (f.password !== f.confirm) {
      next.confirm = tr("Passwords do not match");
    }

    if (!agree) {
      next.agree = tr("Please accept the Terms & Privacy Policy");
    }

    setErr(next);

    const first = next.shopName || next.email || next.password || next.confirm || next.agree;

    if (first) {
      toast.error(first);
      return;
    }

    try {
      store.save({
        language,
        shopName: shopTrimmed,
        email: emailTrimmed,
        phone: "",
        password: f.password,
        currency: f.currency,
        country: f.country,
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

          <div className="signup-benefits">
            {benefits.map((b, i) => (
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
        </section>

        <section className="signup-form-panel">
          <header className="signup-form-heading">
            <h1>{tr("Create Account")}</h1>
            <p>{tr("Get started with your free shop account")}</p>
          </header>

          <form onSubmit={submit} className="signup-form">
            <div className="signup-form-fields">
              {/* Row 1 Left: Shop Name */}
              <Field
                icon={<Store className="h-5 w-5" />}
                label={tr("Shop Name")}
                placeholder={tr("Enter shop name")}
                value={f.shopName}
                error={err.shopName}
                onChange={set("shopName")}
                required
              />

              {/* Row 2 Left: Email with Real Domain Validation */}
              <Field
                icon={<Mail className="h-5 w-5" />}
                inputMode="email"
                label={tr("Email")}
                placeholder={tr("Enter email address (e.g. name@gmail.com)")}
                type="email"
                autoComplete="email"
                value={f.email}
                error={err.email}
                onChange={set("email")}
                required
              />

              {/* Rows 1 & 2 Right: Logo Upload */}
              <div className="signup-upload">
                <LogoCropPicker value={f.logo} onChange={(logo) => setF((previous) => ({ ...previous, logo }))} />
              </div>

              {/* Row 3: Password (1/2) and Confirm Password (1/2) */}
              <div className="signup-row-split signup-passwords-row">
                <Field
                  icon={<Lock className="h-5 w-5" />}
                  password
                  label={tr("Password")}
                  placeholder={tr("Create password")}
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
                  placeholder={tr("Re-enter password")}
                  autoComplete="new-password"
                  error={err.confirm}
                  value={f.confirm}
                  onChange={set("confirm")}
                  required
                />
              </div>

              {/* Row 4: Currency (1/2) and Country (1/2) Linked */}
              <div className="signup-row-split signup-currency-row">
                <SearchableCurrencyPicker
                  value={f.currency}
                  onChange={(curr, countryCode) => {
                    setF((prev) => ({
                      ...prev,
                      currency: curr,
                      country: countryCode || prev.country,
                    }));
                  }}
                />

                <SearchableCountryPicker
                  value={f.country}
                  onChange={(countryCode, currCode) => {
                    setF((prev) => ({
                      ...prev,
                      country: countryCode,
                      currency: currCode || prev.currency,
                    }));
                  }}
                />
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
              {/* Outstanding Full-Width Create Account Button */}
              <ShopButton type="submit" className="auth-btn-primary w-full">
                {tr("Create Account")}
              </ShopButton>

              {/* 3-in-1 Social Row: Google, Apple, 6-Digit */}
              <SocialButtons />

              {/* 1/2 + 1/2 Bottom Card Box */}
              <div className="auth-split-card">
                <span className="auth-split-label">{tr("Already have an account?")}</span>
                <Link to="/" className="auth-split-btn auth-split-btn-emerald">
                  {tr("Log In")} →
                </Link>
              </div>
            </div>
          </form>
        </section>
      </div>
    </main>
  );
}
