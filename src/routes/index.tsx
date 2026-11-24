import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Lock, Mail } from "lucide-react";
import { toast } from "sonner";
import { Field, SocialButtons, TopBar, rememberSignIn } from "@/components/shopbook/ui";
import { ConnectionPill, useConnection } from "@/components/shopbook/connection-status";
import { ShopButton } from "@/components/ui/shop-button";
import { useLanguage } from "@/hooks/use-language";
import { SUPPORT } from "@/lib/i18n";
import { checkPassword } from "@/lib/device-password";
import { PLANS, store, type Account, type PlanId } from "@/lib/shopbook";
import { resumeEmployeeSession, signInEmployee, takeSignOutNotice } from "@/lib/staff-session";
import { authenticatedContext, authMessage, currentIdentity, registerEmailIdentity, signInEmail } from "@/lib/auth-service";
import { createOwnerFromIdentity, linkBusinessOnline } from "@/lib/owner-link";
import { SampleShopButton } from "@/components/shopbook/try-and-tour";
import { supabase } from "@/integrations/supabase/client";

/** Log In fills in the last business email or name that logged in on this device (owner, 2026-11-24), only with Remember me ticked;
 *  unticked clears it. A hint for typing, never a password and never a sign-in by itself. */
const LAST_LOGIN_ID = "shopbook.lastLoginId";
const lastLoginId = () => { try { return localStorage.getItem(LAST_LOGIN_ID) ?? ""; } catch { return ""; } };
const keepLoginId = (value: string, keep: boolean) => { try { if (keep && value.trim()) localStorage.setItem(LAST_LOGIN_ID, value.trim()); else localStorage.removeItem(LAST_LOGIN_ID); } catch { /* a hint only */ } };

const INVALID_LOGIN_MESSAGE = "Incorrect business name, email, or password.";
const isInvalidLoginError = (error: unknown) => error instanceof Error && /invalid (?:login )?credentials|incorrect (?:email|password)|email or password is incorrect|this login has no access|not connected to an owner or employee/i.test(error.message);

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Log in — Zakrio Systems" },
      { name: "description", content: "Sign in to your Zakrio Systems shop account to run sales, stock and accounts." },
      { property: "og:title", content: "Log in — Zakrio Systems" },
      { property: "og:description", content: "Sign in to your Zakrio Systems shop account." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Login,
});

/** Links this device's owner account to its online identity: sign in online with the same email and password, then let the server
 *  link the business (reconcile_legacy_owner checks ownership itself). Throws when anything isn't ready; nothing local changes then. */
async function linkOwnerOnline(account: Account, password: string) {
  try { await linkOwnerOnlineSteps(account, password); }
  catch (e) { await supabase.auth.signOut({ scope: "local" }).catch(() => undefined); throw e; }
}
async function linkOwnerOnlineSteps(account: Account, password: string) {
  await signInEmail(account.email, password);
  await linkSignedInOwner(account);
}
/** With an online session already open, links this device's business to it (the server checks ownership itself). */
async function linkSignedInOwner(account: Account) {
  const identity = await currentIdentity();
  if (!identity?.verified) throw new Error("Online identity not verified yet");
  const legacyBusiness = account.businessId;
  if (!legacyBusiness) throw new Error("No business to link");
  const linked = await linkBusinessOnline({ legacyBusiness, businessName: account.shopName, currency: account.currency, country: account.country });
  if (linked.status !== "complete") {
    store.update({ authMigration: { status: "manual_reconciliation", centralUserId: identity.userId, updatedAt: Date.now(), ...(linked.reason ? { message: linked.reason } : {}) } });
    return;
  }
  const context = await authenticatedContext();
  if (context.kind !== "owner") throw new Error("Not an owner identity");
  store.update({
    authMigration: { status: "complete", centralUserId: identity.userId, ...(linked.account ? { centralAccountId: linked.account } : {}), ...(linked.business ? { centralBusinessId: linked.business } : {}), updatedAt: Date.now() },
    centralContext: { accountId: context.accountId, businesses: context.businesses, locations: context.locations, subscription: context.subscription, syncBusiness: context.syncBusiness, syncedAt: Date.now() },
  });
}
/** An account made without internet (Create Account couldn't reach the server, so authMigration is "not_started") has no online
 *  identity: create it now with the same email and password, as Create Account would have. "verify": the email must be confirmed
 *  first (the next login after that links the business, as for any pending owner). An existing online identity for the email is
 *  linked only with its own password (linkOwnerOnline), never taken over. */
async function connectOfflineOwner(account: Account, password: string): Promise<"linked" | "verify"> {
  const made = await registerEmailIdentity(account.email, password, account.shopName);
  if (made.user && !made.session && made.user.identities?.length === 0) { await linkOwnerOnline(account, password); return "linked"; }
  if (made.verificationRequired) {
    store.update({ authMigration: { status: "pending", ...(made.user ? { centralUserId: made.user.id } : {}), updatedAt: Date.now() } });
    return "verify";
  }
  try { await linkSignedInOwner(account); }
  catch (e) { await supabase.auth.signOut({ scope: "local" }).catch(() => undefined); throw e; }
  return "linked";
}
const withTimeout = <T,>(p: Promise<T>, ms: number) => Promise.race([p, new Promise<never>((_, no) => setTimeout(() => no(new Error("timeout")), ms))]);

function Login() {
  const nav = useNavigate();
  const { tr, dir, language } = useLanguage();
  const [id, setId] = useState("");
  // The last business email or name that logged in here (Remember me ticked) is filled in, read after mount so hydration matches.
  useEffect(() => { const last = lastLoginId(); if (last) setId((v) => v || last); }, []);
  const [pw, setPw] = useState("");
  const [remember, setRemember] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { reason: offline } = useConnection();
  const [lockedUntil, setLockedUntil] = useState(0);
  const [fails, setFails] = useState<number[]>([]);
  const failedAttempt = () => setFails((list) => {
    const recent = [...list.filter((t) => Date.now() - t < 60_000), Date.now()];
    if (recent.length >= 5) { setLockedUntil(Date.now() + 60_000); return []; }
    return recent;
  });
  useEffect(() => { const notice = takeSignOutNotice(); if (notice) toast.error(tr(notice)); }, [tr]);

  useEffect(() => {
    let active = true;
    const resumeCentral = async () => {
      if (busy) return;
      const { data } = await supabase.auth.getSession();
      if (!active || !data.session) return;
      try {
        const context = await authenticatedContext();
        if (!active) return;
        if (context.kind === "member") { await resumeEmployeeSession(); nav({ to: "/apps", replace: true }); return; }
        const identity = await currentIdentity();
        if (!identity) return;
        const local = store.get();
        if (local?.staff) return;
        if (local?.authMigration?.status === "complete" && local.authMigration.centralUserId !== identity.userId) {
          await supabase.auth.signOut({ scope: "local" });
          toast.error(tr("This device's local business is linked to another central identity."));
          return;
        }
        if (local && local.authMigration?.status !== "complete") {
          // A business on this device that isn't linked yet: it is linked only after its own password is typed once (below),
          // so nobody can claim it just by signing in with their own Google or Apple account.
          await supabase.auth.signOut({ scope: "local" });
          toast(tr("This device has a business that isn't linked to an online account yet. Log in once with its email and password to link it."));
          return;
        }
        const business = context.businesses.find((b) => b.legacy_business_id === context.syncBusiness) ?? context.businesses[0];
        const businessKey = local?.businessId ?? context.syncBusiness ?? business?.legacy_business_id;
        if (!businessKey) { toast.error(tr("No verified device-business mapping exists yet. Use the original device or request manual reconciliation.")); return; }
        const centralPlan = context.subscription?.status === "trial" ? "trial" : PLANS.find((p) => p.id === context.subscription?.plan_id)?.id;
        const account: Account = local ?? { shopName: business?.name ?? "ZAKRIO SYSTEMS", email: identity.email ?? "", currency: business?.currency ?? "KES", password: "", businessId: businessKey, role: "owner", ...(centralPlan ? { plan: centralPlan } : {}) };
        store.save({ ...account, authMigration: { status: "complete", centralUserId: identity.userId, centralAccountId: context.accountId, ...(business ? { centralBusinessId: business.id } : {}), updatedAt: Date.now() }, centralContext: { accountId: context.accountId, businesses: context.businesses, locations: context.locations, subscription: context.subscription, syncBusiness: context.syncBusiness, syncedAt: Date.now() } });
        store.signIn();
        nav({ to: account.plan ? (account.setupPending ? "/setup" : "/apps") : "/plans", replace: true });
      } catch (e) {
        if (!active) return;
        const message = authMessage(e);
        // Signed in with Google, Apple or a verified email, but no business on the server yet.
        if (/not connected to an owner or employee/i.test(message)) {
          const local = store.get();
          if (!local || local.staff) {
            // First Google/Apple sign-in: the business is created straight away; Setup collects its details next.
            if (local?.staff) return;
            try {
              const created = await createOwnerFromIdentity(language);
              toast.success(tr("Your account is ready. Choose a plan to start."));
              nav({ to: created.plan ? "/setup" : "/plans", replace: true });
            } catch (x) {
              await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
              toast.error(tr(authMessage(x)));
            }
            return;
          }
          if (local.authMigration?.status !== "complete") {
            await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
            toast(tr("This device has a business that isn't linked to an online account yet. Log in once with its email and password to link it."));
            return;
          }
        }
        toast.error(tr(message));
      }
    };
    const auth = supabase.auth.onAuthStateChange((event) => { if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") window.setTimeout(() => void resumeCentral(), 0); });
    void resumeCentral();
    return () => { active = false; auth.data.subscription.unsubscribe(); };
  }, [busy, nav, tr, language]);

  const submit = (e: React.FormEvent) => { e.preventDefault(); void logIn(id, pw); };
  /** The one login routine: the form and the Email button's window both use it, so linking and every check are identical. */
  const logIn = async (id: string, pw: string) => {
    setError(null);
    // After 5 wrong passwords in a minute, wait a minute: said plainly, with the way out.
    if (lockedUntil > Date.now()) { setError(tr("Too many tries. Wait a minute, or reset your password.")); return; }
    const account = store.get();
    const norm = (value: string) => value.trim().toLowerCase().replace(/\s+/g, "");
    const sameOwner = Boolean(account && (norm(account.shopName) === norm(id) || norm(account.email || "") === norm(id)));

    if (account && sameOwner) {
      const check = await checkPassword(pw, account.password);
      if (!check.ok) {
        setError(tr(INVALID_LOGIN_MESSAGE));
        failedAttempt();
        return;
      }
      if (check.upgrade) store.update({ password: check.upgrade });
      if (account.authMigration?.status === "complete") {
        // Linked already: make sure the online session is this owner's, signing in again quietly if it ran out. Without
        // internet the device login stands and syncing resumes later; a session belonging to someone else is refused.
        let identity = await currentIdentity().catch(() => null);
        if (!identity && account.email) {
          setBusy(true);
          try { await withTimeout(signInEmail(account.email, pw), 9000); identity = await currentIdentity().catch(() => null); } catch { /* offline or not reachable: device login */ }
          finally { setBusy(false); }
        }
        if (identity && identity.userId !== account.authMigration.centralUserId) {
          await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
          toast.error(tr("This device's business belongs to a different online account. Log in with that account's email."));
          return;
        }
        if (identity) {
          try {
            const context = await authenticatedContext();
            if (context.kind === "owner" && context.accountId === account.authMigration.centralAccountId) store.update({ centralContext: { accountId: context.accountId, businesses: context.businesses, locations: context.locations, subscription: context.subscription, syncBusiness: context.syncBusiness, syncedAt: Date.now() } });
          } catch { /* the server copy refreshes on the next sync */ }
        }
      }
      // Not linked online yet (Create Account registers the online identity; linking waits for email verification and the
      // server step): try once, quietly, with the same email and password. Offline or not ready yet, the device login stands.
      if (account.authMigration?.status !== "complete" && account.authMigration?.status !== "manual_reconciliation" && account.email) {
        setBusy(true);
        try {
          if (account.authMigration?.status === "not_started") {
            // Made offline: create the online account now (the email is confirmed before the business is linked).
            const result = await withTimeout(connectOfflineOwner(account, pw), 12000);
            if (result === "verify") toast(tr("Your account is going online. We sent a link to {x}: open it, then log in again to finish.", account.email));
            else if (store.get()?.authMigration?.status === "complete") toast.success(tr("Your account is now connected online."));
          } else await withTimeout(linkOwnerOnline(account, pw), 9000);
        } catch { /* stays a device login; linking is retried next time */ }
        finally { setBusy(false); }
      }
      rememberSignIn("email");
      store.signIn(remember); keepLoginId(id, remember);
      nav({ to: !account.plan ? "/plans" : account.setupPending ? "/setup" : "/apps" });
      return;
    }

    // Local employees and central owners authenticate through their server-authorized flows.
    setBusy(true);
    try {
      let employeeError: unknown;
      try {
        await signInEmployee(id, pw);
        keepLoginId(id, remember);
        nav({ to: "/apps" });
        return;
      } catch (error) {
        employeeError = error;
      }

      if (!id.includes("@")) throw employeeError;
      if (employeeError instanceof Error && /too many attempts|suspended|revoked|access has ended/i.test(employeeError.message)) {
        throw employeeError;
      }

      // Email owners use central auth only after the employee endpoint declines the login.
      // This never registers an account; account creation remains explicit on /signup.
      await signInEmail(id, pw);
      const context = await authenticatedContext();
      if (context.kind === "member") {
        await resumeEmployeeSession();
        keepLoginId(id, remember);
        nav({ to: "/apps" });
        return;
      }

      const identity = await currentIdentity();
      if (!identity) throw new Error("Central identity session was not established.");
      const local = store.get();
      if (local?.staff) throw new Error("Sign out of the employee account before signing into an owner account.");
      if (local?.authMigration?.status === "complete" && local.authMigration.centralUserId !== identity.userId) {
        await supabase.auth.signOut({ scope: "local" });
        throw new Error("This device's local business is linked to another central identity. Use the linked identity or request manual reconciliation.");
      }
      if (local && local.authMigration?.status !== "complete") {
        // The same email and password as the business on this device: link them now. Otherwise this device holds someone
        // else's business, which is never handed to a different online account.
        const sameEmail = (local.email || "").trim().toLowerCase() === (identity.email || "").trim().toLowerCase();
        const own = sameEmail && local.password ? (await checkPassword(pw, local.password)).ok : false;
        if (!own) {
          await supabase.auth.signOut({ scope: "local" });
          throw new Error("This device holds another business that isn't linked online. Log in with that business's email and password, or use another device.");
        }
        await linkSignedInOwner(local);
        store.signIn(remember); keepLoginId(id, remember);
        nav({ to: local.plan ? (local.setupPending ? "/setup" : "/apps") : "/plans" });
        return;
      }
      const business = context.businesses.find((item) => item.legacy_business_id === context.syncBusiness) ?? context.businesses[0];
      const businessKey = local?.businessId ?? context.syncBusiness ?? business?.legacy_business_id;
      if (!local && !businessKey) {
        throw new Error("This owner has no verified device-business mapping yet. Restore the original device data or request manual reconciliation.");
      }
      const centralPlan = context.subscription?.status === "trial" ? "trial" : PLANS.find((plan) => plan.id === context.subscription?.plan_id)?.id;
      const ownerAccount: Account = local ?? {
        shopName: business?.name ?? "ZAKRIO SYSTEMS", email: identity.email ?? "", currency: business?.currency ?? "KES", password: "",
        businessId: businessKey!, role: "owner", ...(centralPlan ? { plan: centralPlan as PlanId | "trial" } : {}),
        authMigration: { status: "complete", centralUserId: identity.userId, centralAccountId: context.accountId, ...(business ? { centralBusinessId: business.id } : {}), updatedAt: Date.now() },
      };
      store.save({ ...ownerAccount, authMigration: { status: "complete", centralUserId: identity.userId, centralAccountId: context.accountId, ...(business ? { centralBusinessId: business.id } : {}), updatedAt: Date.now() }, centralContext: { accountId: context.accountId, businesses: context.businesses, locations: context.locations, subscription: context.subscription, syncBusiness: context.syncBusiness, syncedAt: Date.now() } });
      store.signIn(remember); keepLoginId(id, remember);
      nav({ to: ownerAccount.plan ? (ownerAccount.setupPending ? "/setup" : "/apps") : "/plans" });
    } catch (error) {
      // A business name works only where the business was created, so a wrong one (no "@") also says how to log in elsewhere.
      if (isInvalidLoginError(error)) { setError(id.includes("@") ? tr(INVALID_LOGIN_MESSAGE) : `${tr(INVALID_LOGIN_MESSAGE)} ${tr("On a new phone or computer, log in with your email.")}`); failedAttempt(); }
      else toast.error(tr(authMessage(error)));
    } finally {
      setBusy(false);
    }
  };


  return (
    <>
      <header className="signup-form-heading">
        <ConnectionPill />
            <h1><span className="auth-phone-text">{tr("Log In")}</span><span className="auth-desk-text">{tr("Welcome back")}</span></h1>
            <p>{tr("Sign in to your business account")}</p>
            {/* No internet at all, or internet but the server isn't answering (said only after two missed checks in a row). */}
            {offline === "internet" && <p className="login-offline" role="status">{tr("You're offline. You can still log in if you've used the app here before. Google and Apple need internet.")}</p>}
            {offline === "server" && <p className="login-offline" role="status">{tr("Can't reach the Zakrio server right now. You can still log in if you've used the app here before.")}</p>}
          </header>

          <form onSubmit={submit} className="signup-form">
            <div className="login-fields">
              <Field
                icon={<Mail className="h-5 w-5" />}
                label={tr("Business Name or Email")}
                placeholder={tr("Business name or email")}
                autoComplete="username"
                type="text"
                value={id}
                onChange={(e) => { setId(e.target.value); if (error) setError(null); }}
                error={error ?? undefined}
                required
              />
              <Field
                icon={<Lock className="h-5 w-5" />}
                password
                label={tr("Password")}
                placeholder={tr("Enter password")}
                autoComplete="current-password"
                value={pw}
                onChange={(e) => { setPw(e.target.value); if (error) setError(null); }}
                required
              />
            </div>

            <div className="signup-agreement login-row">
              <label className="signup-agreement-label">
                <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
                <span>{tr("Remember me")}</span>
              </label>

              <button
                type="button"
                className="login-forgot"
                onClick={() => nav({ to: "/auth/recovery" })}
              >
                {tr("Forgot Password?")}
              </button>
            </div>

            <div className="signup-actions">
              {/* Outstanding Full-Width Log In Button */}
              <ShopButton type="submit" className="auth-btn-primary w-full" disabled={busy}>
                {tr("Log In")}
              </ShopButton>

              {/* Register card above social sign-in options (phones and narrow tablets; wider screens switch from the welcome panel) */}
              <div className="auth-split-card">
                <span className="auth-split-label">{tr("Don't have an account?")}</span>
                <Link to="/signup" className="auth-split-btn auth-split-btn-register">
                  {tr("Register now")} →
                </Link>
              </div>

              {/* Google, Apple and Email on one line. */}
              <SocialButtons passkey />
              {/* Try before signing up (owner, 2026-11-23): a full sample shop, only on a device without a business. */}
              <SampleShopButton />
              {/* New staff often arrive here before they have a password: the invitation link is where they set it. */}
              <p className="login-staff-note">{tr("New staff? Open the invitation link your employer sent you to set your password.")}</p>
              <p className="login-help-note">{tr("Need help?")} <a href={`https://wa.me/${SUPPORT.whatsapp}`} target="_blank" rel="noreferrer">{tr("WhatsApp support")}</a></p>
            </div>
      </form>
    </>
  );
}


