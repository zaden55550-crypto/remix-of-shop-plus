/** Shared DataQuill Solutions identity/session boundary. Local ERP credentials are never sent to Supabase. */
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { store } from "@/lib/shopbook";
import { myAccess, ownerBusinessContext, type MyAccess } from "@/lib/people-access.functions";

export type IdentityProvider = "google" | "apple";
export type CentralIdentity = { userId: string; email: string | null; verified: boolean; providers: string[] };
export type AuthenticatedContext =
  | { kind: "owner"; accountId: string; businesses: { id: string; name: string; currency: string; legacy_business_id: string | null }[]; locations: { id: string; name: string; kind: string; business_id: string; erp_ref: string | null; status: string }[]; subscription: { plan_id: string; status: string; billing_cycle: string | null; trial_ends_at: string | null } | null; syncBusiness: string | null }
  | Extract<MyAccess, { kind: "member" }>;

export function authMessage(error: unknown) {
  const raw = error instanceof Error ? error.message : "Authentication could not be completed";
  if (/already.*(linked|registered)|identity.*exists/i.test(raw)) return "That sign-in method is already linked to another account. Sign in to that account or contact support for manual reconciliation.";
  if (/invalid login credentials|invalid.*password/i.test(raw)) return "Email or password is incorrect.";
  if (/email not confirmed|not confirmed/i.test(raw)) return "Verify your email before signing in.";
  if (/expired|invalid.*token/i.test(raw)) return "This verification or recovery link has expired. Request a new one.";
  if (/provider.*(disabled|not enabled)/i.test(raw)) return "This sign-in provider is not enabled for this application.";
  if (/rate limit|too many|over_request|429/i.test(raw)) return "Too many tries. Wait a minute, or reset your password.";
  // Plain words instead of browser or server setup errors.
  if (/failed to fetch|networkerror|network request failed|load failed|fetch failed|ERR_INTERNET|timeout/i.test(raw)) return "Can't reach the server. Check your internet and try again.";
  if (/environment variable|SERVICE_ROLE|not configured|Connect Supabase/i.test(raw)) return "Online sign-in isn't available right now. Try again later.";
  return raw;
}

export async function currentIdentity(): Promise<CentralIdentity | null> {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw new Error(authMessage(error));
  const user = data.user;
  if (!user) return null;
  const providers = user.identities?.map((item) => item.provider).filter(Boolean) ?? [];
  return { userId: user.id, email: user.email ?? null, verified: Boolean(user.email_confirmed_at || user.phone_confirmed_at), providers: [...new Set(providers)] };
}

export async function signInEmail(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
  if (error) throw new Error(authMessage(error));
  return data;
}

export async function registerEmailIdentity(email: string, password: string, fullName: string) {
  const { data, error } = await supabase.auth.signUp({ email: email.trim(), password, options: { data: { full_name: fullName }, emailRedirectTo: `${window.location.origin}/auth/return` } });
  if (error) throw new Error(authMessage(error));
  return { user: data.user, session: data.session, verificationRequired: !data.session };
}

/** Sends the email-verification link for a new online account again. Doesn't reveal whether the address has an account. */
export async function resendVerification(email: string) {
  const { error } = await supabase.auth.resend({ type: "signup", email: email.trim(), options: { emailRedirectTo: `${window.location.origin}/auth/return` } });
  if (error) throw new Error(authMessage(error));
}

export async function signInProvider(provider: IdentityProvider, redirectTo = `${window.location.origin}/auth/return`) {
  const result = await lovable.auth.signInWithOAuth(provider, { redirect_uri: redirectTo });
  if (result.error) throw new Error(authMessage(result.error));
  return result;
}

/** Linking is only allowed to the currently authenticated identity; never search/link by email. */
export async function linkProvider(provider: IdentityProvider, redirectTo = `${window.location.origin}/settings`) {
  const identity = await currentIdentity();
  if (!identity || !identity.verified) throw new Error("Sign in with a verified account before linking another provider.");
  const { data, error } = await supabase.auth.linkIdentity({ provider, options: { redirectTo } });
  if (error) throw new Error(authMessage(error));
  return data;
}

export async function requestOwnerRecovery(email: string) {
  // Through Resend when the server has it (owner-reset.functions.ts); otherwise the sign-in system's own reset email.
  const { sendOwnerReset } = await import("@/lib/owner-reset.functions");
  const viaResend = await sendOwnerReset({ data: { email: email.trim() } }).then((r) => r.resend).catch((e: unknown) => { if (e instanceof Error && /couldn't be sent/.test(e.message)) throw e; return false; });
  if (viaResend) return;
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/auth/recovery` });
  if (error) throw new Error(authMessage(error));
  // Do not reveal whether an address has an account.
}

export async function finishOwnerRecovery(password: string) {
  const { data, error } = await supabase.auth.updateUser({ password });
  if (error) throw new Error(authMessage(error));
  return data.user;
}

/** Resolves the identity's server-authorized context. Client profile fields never grant access. */
export async function authenticatedContext(): Promise<AuthenticatedContext> {
  const access = await myAccess();
  if (access.kind === "owner") {
    const context = await ownerBusinessContext();
    return { kind: "owner", accountId: context.account, businesses: context.businesses, locations: context.locations, subscription: context.subscription, syncBusiness: context.syncBusiness };
  }
  if (access.kind === "member") return access;
  if (access.kind === "blocked") throw new Error(authMessage(new Error(access.reason)));
  throw new Error("This verified identity is not connected to an owner or employee account.");
}

export async function installAuthSession(tokens: { accessToken: string; refreshToken: string }) {
  const { error } = await supabase.auth.setSession({ access_token: tokens.accessToken, refresh_token: tokens.refreshToken });
  if (error) throw new Error(authMessage(error));
}

export async function clearAuthSession() {
  const { error } = await supabase.auth.signOut({ scope: "local" });
  if (error) throw new Error(authMessage(error));
}

/** Expires a migrated owner's local UI session when Supabase emits SIGNED_OUT; business data stays on-device. */
export function expireMigratedOwnerSession() {
  const account = store.get();
  if (!account || account.staff || account.authMigration?.status !== "complete" || !store.signedIn()) return false;
  store.signOut();
  return true;
}

/** One logout entry for owners and employees. Employee cleanup preserves their unsent sales queue. */
export async function signOutUnified() {
  if (store.get()?.staff) {
    const { endStaffSession } = await import("@/lib/staff-session");
    await endStaffSession();
    return;
  }
  const { error } = await supabase.auth.signOut({ scope: "local" });
  store.signOut();
  if (error) throw new Error(authMessage(error));
}

/* Passkeys: sign in with the phone's or computer's fingerprint, face or screen lock instead of a password. A passkey belongs to an
   online account, so it needs internet and is added from inside the app (Settings › Login Security) after a normal sign-in. */
export type Passkey = { id: string; name: string; createdAt: string; lastUsedAt?: string | undefined };
/** Whether the server has passkeys switched on (its public sign-in settings). Asked once per page load; false when unreachable,
 *  so the Passkey button never shows for a sign-in that can't work. */
let passkeysOnServer: Promise<boolean> | undefined;
export function passkeysEnabled(): Promise<boolean> {
  passkeysOnServer ??= (async () => {
    const url = import.meta.env["VITE_SUPABASE_URL"], key = import.meta.env["VITE_SUPABASE_PUBLISHABLE_KEY"];
    if (!url || !key) return false;
    try {
      const r = await fetch(`${url}/auth/v1/settings`, { headers: { apikey: key } });
      return r.ok && (await r.json() as { passkeys_enabled?: boolean }).passkeys_enabled === true;
    } catch { passkeysOnServer = undefined; return false; }
  })();
  return passkeysOnServer;
}
export const passkeysSupported = () => typeof window !== "undefined" && "PublicKeyCredential" in window && Boolean(navigator.credentials);
/** True when the person closed or cancelled the fingerprint/face prompt: nothing to report then. */
export function passkeyCancelled(error: unknown) {
  const e = error as { code?: string; name?: string; message?: string } | null;
  return Boolean(e && (e.code === "ERROR_CEREMONY_ABORTED" || e.name === "NotAllowedError" || e.name === "AbortError" || /cancel|not allowed|abort|timed out/i.test(e.message ?? "")));
}
/** Plain words for passkey problems. */
export function passkeyMessage(error: unknown) {
  const raw = (error as { message?: string } | null)?.message ?? "";
  if (/passkey.*(disabled|not enabled)|webauthn.*(disabled|not enabled)|404|not found/i.test(raw)) return "Passkeys aren't switched on for this app yet. Use your email and password.";
  if (/no.*(credential|passkey)|unknown credential|not registered/i.test(raw)) return "No passkey for this app was found here. Log in with your email and password, then add one in Settings › Login Security.";
  if (/already.*registered|excludeCredentials|InvalidStateError/i.test(raw)) return "This phone or computer already has a passkey for your account.";
  if (/rp.?id|origin|SecurityError/i.test(raw)) return "Passkeys work on your published site, not on this test copy.";
  return authMessage(error);
}
export async function signInPasskey() {
  const { data, error } = await supabase.auth.signInWithPasskey();
  if (error) throw error;
  return data;
}
export async function addPasskey() {
  const { data, error } = await supabase.auth.registerPasskey();
  if (error) throw error;
  return data;
}
export async function listPasskeys(): Promise<Passkey[]> {
  const { data, error } = await supabase.auth.passkey.list();
  if (error) throw error;
  return (data ?? []).map((p) => ({ id: p.id, name: p.friendly_name || "Passkey", createdAt: p.created_at, lastUsedAt: p.last_used_at }));
}
export async function removePasskey(id: string) {
  const { error } = await supabase.auth.passkey.delete({ passkeyId: id });
  if (error) throw error;
}
