import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Lock, Mail, Store } from "lucide-react";
import { toast } from "sonner";
import {
  Field,
  LogoCropPicker,
  SearchableCurrencyPicker,
  SearchableCountryPicker,
  SocialButtons,
  TopBar,
} from "@/components/shopbook/ui";
import { ShopButton } from "@/components/ui/shop-button";
import { ConnectionPill, useConnection } from "@/components/shopbook/connection-status";
import { useLanguage } from "@/hooks/use-language";
import { hashPassword } from "@/lib/device-password";
import { passwordProblem, passwordStrength } from "@/lib/password-strength";
import { store } from "@/lib/shopbook";
import { detectUserCountry } from "@/lib/world-data";
import { cleanDialCode, dialCodeFor, kenyaPhoneHint, phoneToSave } from "@/lib/dial-codes";
import { authMessage, authenticatedContext, currentIdentity, registerEmailIdentity } from "@/lib/auth-service";
import { supabase } from "@/integrations/supabase/client";
import { linkBusinessOnline } from "@/lib/owner-link";
import { randomUUID } from "@/lib/id";

export const Route = createFileRoute("/signup")({
  head: () => ({
    meta: [
      { title: "Create Account — Zakrio Systems" },
      {
        name: "description",
        content:
          "Create your free Zakrio Systems shop account to manage sales, stock and accounts.",
      },
      { property: "og:title", content: "Create Account — Zakrio Systems" },
      { property: "og:description", content: "Create your free Zakrio Systems shop account." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Signup,
});

const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
const PHONE_REGEX = /^\+?[0-9][0-9\s\-().]{6,18}$/;

/** Wraps each translated link phrase found in the translated sentence in a link that opens in a new tab,
 *  so the form in progress is kept. A phrase missing from a translation is still offered after the sentence. */
function agreementText(sentence: string, links: [string, string][]) {
  const link = (label: string, href: string) => (
    <a
      key={href}
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="underline underline-offset-2"
    >
      {label}
    </a>
  );
  const found = links
    .map(([label, href]) => ({ label, href, at: sentence.indexOf(label) }))
    .filter((x) => x.at >= 0)
    .sort((a, b) => a.at - b.at);
  const parts: React.ReactNode[] = [];
  const shown = new Set<string>();
  let from = 0;
  for (const x of found) {
    if (x.at < from) continue;
    shown.add(x.href);
    parts.push(sentence.slice(from, x.at), link(x.label, x.href));
    from = x.at + x.label.length;
  }
  parts.push(sentence.slice(from));
  for (const [label, href] of links) if (!shown.has(href)) parts.push(" ", link(label, href));
  return parts;
}

function Signup() {
  const nav = useNavigate();
  const { reason: offline } = useConnection();
  const { tr, dir, language } = useLanguage();

  const [f, setF] = useState({
    shopName: "",
    email: "",
    // Phone is two boxes: the dialling code (filled from the chosen country, editable) and the number.
    dial: dialCodeFor("KEN"),
    phone: "",
    password: "",
    confirm: "",
    currency: "KSH",
    country: "KEN",
    logo: "",
  });

  useEffect(() => {
    const detected = detectUserCountry();
    setF((prev) =>
      prev.currency === "KSH" && prev.country === "KEN"
        ? {
            ...prev,
            currency: detected.currencyCode,
            country: detected.countryCode,
            dial: dialCodeFor(detected.countryCode),
          }
        : prev,
    );
  }, []);

  const [agree, setAgree] = useState(false);
  // Came through an invite link (/signup?ref=CODE, kept by captureReferral): say so, so the new owner knows it counted. Read after mount.
  const [invitedBy, setInvitedBy] = useState("");
  useEffect(() => { try { const ref = new URLSearchParams(window.location.search).get("ref") || localStorage.getItem("shopbook.ref") || ""; if (/^[A-Za-z0-9]{6}$/.test(ref)) setInvitedBy(ref.toUpperCase()); } catch { /* no badge */ } }, []);
  // Signed in with Google or Apple (or a verified email) but no business yet: finish here with that account. The email is the
  // account's, no password is needed (they log in with the same Google/Apple button), and Create Account links the business.
  const [online, setOnline] = useState<{ email: string; provider: string } | null>(null);
  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (!data.session) return;
        const identity = await currentIdentity();
        if (!live || !identity?.email) return;
        try { await authenticatedContext(); nav({ to: "/", replace: true }); return; } catch { /* no business yet: finish it here */ }
        if (!live) return;
        setOnline({ email: identity.email, provider: identity.providers.find((p) => p !== "email") ?? "email" });
        setF((prev) => ({ ...prev, email: identity.email ?? prev.email }));
      } catch { /* offline: the ordinary form */ }
    })();
    return () => { live = false; };
  }, [nav]);
  const [err, setErr] = useState<{
    shopName?: string;
    email?: string;
    phone?: string;
    password?: string;
    confirm?: string;
    agree?: string;
  }>({});

  const set = (k: keyof typeof f) => (e: { target: { value: string } }) =>
    setF((previous) => ({ ...previous, [k]: e.target.value }));

  const strength = passwordStrength(f.password);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();

    const next: typeof err = {};

    const shopTrimmed = f.shopName.trim();
    if (!shopTrimmed) {
      next.shopName = tr("Company name is required");
    }

    const emailTrimmed = f.email.trim();
    if (!emailTrimmed) {
      next.email = tr("Email address is required");
    } else if (!EMAIL_REGEX.test(emailTrimmed)) {
      next.email = tr(
        "Please enter a valid email address ending in .com, .co, etc. (e.g. name@gmail.com)",
      );
    }

    // Only the code typed counts as no phone (the field is optional); a number is saved with its code.
    const phoneTrimmed = f.phone.trim().startsWith("+")
      ? phoneToSave(f.phone)
      : phoneToSave(`${f.dial} ${f.phone}`);
    if (phoneTrimmed && !PHONE_REGEX.test(phoneTrimmed.replace(/\s+/g, " "))) {
      next.phone = tr("Please enter a valid phone number");
    }

    const pwProblem = online ? null : passwordProblem(f.password);
    if (pwProblem) {
      next.password = tr(pwProblem);
    } else if (!online && f.password !== f.confirm) {
      next.confirm = tr("Passwords do not match");
    }

    if (!agree) {
      next.agree = tr("Please accept the Terms & Privacy Policy");
    }

    setErr(next);

    const first =
      next.shopName || next.email || next.phone || next.password || next.confirm || next.agree;

    if (first) {
      toast.error(first);
      return;
    }

    const existing = store.get();
    const normalizeShopName = (value: string) => value.trim().toLowerCase().replace(/\s+/g, " ");
    const duplicateShopName =
      existing && normalizeShopName(existing.shopName) === normalizeShopName(shopTrimmed);
    const duplicateEmail =
      existing && (existing.email || "").trim().toLowerCase() === emailTrimmed.toLowerCase();
    if (existing && (duplicateShopName || duplicateEmail)) {
      const message = tr("This business name or email is already registered. Log in instead.");
      setErr({
        ...(duplicateShopName ? { shopName: message } : {}),
        ...(duplicateEmail ? { email: message } : {}),
      });
      toast.error(message, { action: { label: tr("Log In"), onClick: () => nav({ to: "/" }) } });
      return;
    }

    const legacyBusiness = randomUUID();
    let centralStatus: "pending" | "complete" | "manual_reconciliation" | "not_started" = "pending";
    let centralUserId: string | undefined;
    let centralAccountId: string | undefined;
    let centralBusinessId: string | undefined;
    let centralContext: Awaited<ReturnType<typeof authenticatedContext>> | undefined;
    let identityNotice = "";
    let verifyEmail = false;
    try {
      if (online) {
        const identity = await currentIdentity();
        if (!identity) throw new Error("Sign in with Google or Apple again, then finish here.");
        centralUserId = identity.userId;
        const linked = await linkBusinessOnline({ legacyBusiness, businessName: shopTrimmed, currency: f.currency, country: f.country });
        const context = linked.status === "complete" ? await authenticatedContext() : undefined;
        if (context?.kind === "owner") { centralStatus = "complete"; centralAccountId = linked.account; centralBusinessId = linked.business; centralContext = context; }
        else { centralStatus = "manual_reconciliation"; identityNotice = "The online account could not be linked safely. Your business is kept on this device; contact Support."; }
      } else {
      const identity = await registerEmailIdentity(emailTrimmed, f.password, shopTrimmed);
      if (identity.user && !identity.session && identity.user.identities?.length === 0) {
        throw new Error(
          "An identity already uses this email. Sign in to it first; ZAKRIO SYSTEMS will not link accounts by email.",
        );
      }
      centralUserId = identity.user?.id;
      if (identity.session) {
        try {
          const linked = await linkBusinessOnline({ legacyBusiness, businessName: shopTrimmed, currency: f.currency, country: f.country });
          if (linked.status === "complete") {
            const context = await authenticatedContext();
            if (context.kind === "owner") {
              centralStatus = "complete";
              centralAccountId = linked.account;
              centralBusinessId = linked.business;
              centralContext = context;
            }
          } else {
            centralStatus = "manual_reconciliation";
            identityNotice =
              "The online account could not be linked safely. Your business is kept on this device; contact Support.";
          }
        } catch {
          centralStatus = "pending";
          identityNotice =
            "Your business is saved on this device. Confirm your email, then log in with it to turn on online sign-in.";
        }
      } else verifyEmail = true; // A clear page explains the verification email (/auth/verify) instead of a short toast.
      }
    } catch (identityError) {
      const message = authMessage(identityError);
      if (/already uses this email|already registered|already exists/i.test(message)) {
        toast.error(tr(message));
        return;
      }
      // Any password of 6+ characters is the owner's choice (owner, 2026-11-24): the meter on the form says when it is weak, and a
      // server that refuses a common password is not reported again. The business is kept on this device either way.
      centralStatus = "not_started";
      identityNotice = /weak|easy to guess|pwned|leaked|compromised|common password/i.test(message) ? ""
        : "Your business is saved on this device. Online sign-in could not be set up yet, so it works on this device only for now.";
    }

    try {
      store.register({
        language,
        shopName: shopTrimmed,
        email: emailTrimmed,
        phone: phoneTrimmed,
        // Google/Apple owners log in with that button, so no device password is kept for them.
        password: online ? "" : await hashPassword(f.password),
        currency: f.currency,
        country: f.country,
        logo: f.logo || undefined,
        businessId: legacyBusiness,
        authMigration: {
          status: centralStatus,
          ...(centralUserId ? { centralUserId } : {}),
          ...(centralAccountId ? { centralAccountId } : {}),
          ...(centralBusinessId ? { centralBusinessId } : {}),
          updatedAt: Date.now(),
        },
        ...(centralContext?.kind === "owner"
          ? {
              centralContext: {
                accountId: centralContext.accountId,
                businesses: centralContext.businesses,
                locations: centralContext.locations,
                subscription: centralContext.subscription,
                syncBusiness: centralContext.syncBusiness,
                syncedAt: Date.now(),
              },
            }
          : {}),
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tr("Could not create account"));
      return;
    }

    if (identityNotice) toast(tr(identityNotice));
    if (verifyEmail) { nav({ to: "/auth/verify", search: { email: emailTrimmed } }); return; }
    nav({ to: "/plans" });
  };

  return (
    <>
      <header className="signup-form-heading">
        <ConnectionPill />
        <h1>{tr("Create Account")}</h1>
        <p>{tr("30-day free trial · no card needed")}</p>
        {/* An account made without the server is kept only on this device (nothing links it online later), so say so first. */}
        {offline === "internet" && <p className="login-offline" role="status">{tr("You're offline. An account created now works only on this phone or computer. Connect to the internet first to use it anywhere.")}</p>}
        {offline === "server" && <p className="login-offline" role="status">{tr("Can't reach the Zakrio server right now. An account created now works only on this phone or computer. Try again in a moment to use it anywhere.")}</p>}
      </header>

      <form onSubmit={submit} className="signup-form">
        <div className="signup-form-fields signup-form-grid">
          <Field
            icon={<Store className="h-5 w-5" />}
            label={tr("Business Name")}
            placeholder={tr("Enter business name")}
            value={f.shopName}
            error={err.shopName}
            onChange={set("shopName")}
            required
            className="grid-company"
          />

          <Field
            icon={<Mail className="h-5 w-5" />}
            inputMode="email"
            label={tr("Email")}
            placeholder={tr("Enter email address")}
            type="email"
            autoComplete="email"
            value={f.email}
            error={err.email}
            onChange={set("email")}
            required
            className="grid-email"
          />

          <div className="signup-upload grid-logo">
            <LogoCropPicker
              value={f.logo}
              onChange={(logo) => setF((previous) => ({ ...previous, logo }))}
            />
          </div>

          <div className="grid-country">
            <SearchableCountryPicker
              value={f.country}
              onChange={(countryCode, currCode) => {
                setF((prev) => ({
                  ...prev,
                  country: countryCode,
                  currency: currCode || prev.currency,
                  dial: dialCodeFor(countryCode) || prev.dial,
                }));
              }}
            />
          </div>

          <div className="grid-currency">
            <SearchableCurrencyPicker
              value={f.currency}
              onChange={(curr, countryCode) => {
                setF((prev) => ({
                  ...prev,
                  currency: curr,
                  country: countryCode || prev.country,
                  dial: (countryCode && dialCodeFor(countryCode)) || prev.dial,
                }));
              }}
            />
          </div>

          {/* Phone: two boxes on one row with a divider, +254 | 709090809. Choosing a country fills the code; the person can type
                  another code or number (a number typed with its own "+" is kept as typed). */}
          <div className="signup-field grid-phone">
            <label htmlFor="signup-phone" className="signup-field-label">
              {tr("Phone Number")}
            </label>
            <div className="signup-phone-row">
              <input
                type="tel"
                inputMode="tel"
                autoComplete="tel-country-code"
                aria-label={tr("Country code")}
                className="signup-field-input signup-phone-code"
                placeholder="+254"
                maxLength={5}
                value={f.dial}
                onChange={(e) => {
                  const dial = cleanDialCode(e.target.value);
                  setF((p) => ({ ...p, dial }));
                  setErr((prev) => {
                    const { phone: _phone, ...rest } = prev;
                    return rest;
                  });
                }}
              />
              <span className="signup-phone-divider" aria-hidden="true" />
              <input
                id="signup-phone"
                type="tel"
                inputMode="tel"
                autoComplete="tel-national"
                className="signup-field-input signup-phone-input"
                placeholder={tr("e.g. 712 345 678")}
                value={f.phone}
                aria-invalid={err.phone ? true : undefined}
                onChange={(e) => {
                  const value = e.target.value;
                  setF((p) => ({ ...p, phone: value }));
                  setErr((prev) => {
                    const { phone: _phone, ...rest } = prev;
                    return rest;
                  });
                }}
              />
            </div>
            {err.phone ? (
              <p role="alert" className="signup-error">
                {err.phone}
              </p>
            ) : kenyaPhoneHint(f.dial, f.phone) && <p role="status" className="signup-hint">{tr(kenyaPhoneHint(f.dial, f.phone))}</p>}
          </div>

          {online ? <p className="grid-passwords signup-online-note" role="status">{tr("Signed in as {x}. Add your business details to finish; you'll log in with the same button next time.", online.email)}</p> :
          <div className="grid-passwords">
            {/* The strength meter sits on the Password label line, so the form keeps its height. */}
            <div className="pw-field">
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
            {strength.level > 0 && <span className={`pw-meter is-${strength.level}`} role="status" aria-live="polite" title={tr("At least 6 characters")}>
              <span className="pw-meter-bar" aria-hidden><i /><i /><i /><i /></span><b>{tr(strength.label)}</b>
            </span>}
            </div>
            <div className="pw-field">
            <Field
              icon={<Lock className="h-5 w-5" />}
              password
              label={tr("Confirm Password")}
              placeholder={tr("Repeat password")}
              autoComplete="new-password"
              error={err.confirm}
              value={f.confirm}
              onChange={set("confirm")}
              required
            />
            {f.confirm && (f.confirm === f.password
              ? <span className="pw-match is-ok" role="status">✓ {tr("Passwords match")}</span>
              : !f.password.startsWith(f.confirm) && <span className="pw-match is-no" role="status">{tr("Doesn't match yet")}</span>)}
            </div>
          </div>}
        </div>

        <div className="signup-agreement signup-agreement-row">
          <label className="signup-agreement-label">
            <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
            <span>
              {agreementText(tr("I agree to the Terms & Conditions and Privacy Policy."), [
                [tr("Terms & Conditions"), "/terms"],
                [tr("Privacy Policy"), "/privacy"],
              ])}
            </span>
          </label>
          {invitedBy && <span className="signup-invited" role="status" title={tr("You were invited with this code")}>✓ {tr("Invited")} · {invitedBy}</span>}

          {err.agree && (
            <p role="alert" className="signup-error">
              {err.agree}
            </p>
          )}
        </div>

        <div className="signup-actions">
          <ShopButton type="submit" className="auth-btn-primary w-full">
            {tr("Create Account")}
          </ShopButton>

          <div className="auth-split-card">
            <span className="auth-split-label">{tr("Already have an account?")}</span>
            <Link to="/" className="auth-split-btn auth-split-btn-emerald">
              {tr("Log In")} →
            </Link>
          </div>

          {/* Google, Apple and Email on one line. */}
          <SocialButtons />
        </div>
      </form>
    </>
  );
}
