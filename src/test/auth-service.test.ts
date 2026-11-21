import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { auth, lovableOAuth, ownerContext, access, storeMock, staffLogout } = vi.hoisted(() => ({
  auth: {
    getUser: vi.fn(), signInWithPassword: vi.fn(), signUp: vi.fn(), linkIdentity: vi.fn(), resetPasswordForEmail: vi.fn(),
    updateUser: vi.fn(), signOut: vi.fn(), setSession: vi.fn(),
  },
  lovableOAuth: vi.fn(), ownerContext: vi.fn(), access: vi.fn(),
  storeMock: { get: vi.fn(), signOut: vi.fn(), signedIn: vi.fn() }, staffLogout: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({ supabase: { auth } }));
vi.mock("@/integrations/lovable/index", () => ({ lovable: { auth: { signInWithOAuth: lovableOAuth } } }));
vi.mock("@/lib/people-access.functions", () => ({ myAccess: access, ownerBusinessContext: ownerContext }));
vi.mock("@/lib/shopbook", () => ({ store: storeMock }));
vi.mock("@/lib/staff-session", () => ({ endStaffSession: staffLogout }));

import { authMessage, authenticatedContext, clearAuthSession, currentIdentity, expireMigratedOwnerSession, finishOwnerRecovery, installAuthSession, linkProvider, registerEmailIdentity, requestOwnerRecovery, signInEmail, signInProvider, signOutUnified } from "@/lib/auth-service";

const verifiedUser = { id: "u1", email: "owner@example.test", email_confirmed_at: "2026-11-01", identities: [{ provider: "email" }] };

beforeEach(() => {
  vi.clearAllMocks();
  storeMock.get.mockReturnValue(null);
  storeMock.signedIn.mockReturnValue(false);
  auth.getUser.mockResolvedValue({ data: { user: verifiedUser }, error: null });
  auth.signInWithPassword.mockResolvedValue({ data: { user: verifiedUser }, error: null });
  auth.signUp.mockResolvedValue({ data: { user: verifiedUser, session: { access_token: "a", refresh_token: "r" } }, error: null });
  auth.linkIdentity.mockResolvedValue({ data: { identity: { provider: "google" } }, error: null });
  auth.resetPasswordForEmail.mockResolvedValue({ error: null });
  auth.updateUser.mockResolvedValue({ data: { user: verifiedUser }, error: null });
  auth.signOut.mockResolvedValue({ error: null });
  auth.setSession.mockResolvedValue({ error: null });
  lovableOAuth.mockResolvedValue({ redirected: true });
});
afterEach(() => vi.restoreAllMocks());

describe("shared authentication service", () => {
  it("reports provider identities as verified only from Supabase user confirmation", async () => {
    expect(await currentIdentity()).toMatchObject({ userId: "u1", email: "owner@example.test", verified: true, providers: ["email"] });
    auth.getUser.mockResolvedValueOnce({ data: { user: { ...verifiedUser, email_confirmed_at: null } }, error: null });
    expect((await currentIdentity())?.verified).toBe(false);
  });
  it("uses central email sign-in and registration", async () => {
    await signInEmail(" owner@example.test ", "secret");
    expect(auth.signInWithPassword).toHaveBeenCalledWith({ email: "owner@example.test", password: "secret" });
    await registerEmailIdentity("new@example.test", "secret", "Owner");
    expect(auth.signUp).toHaveBeenCalledWith(expect.objectContaining({ email: "new@example.test", password: "secret" }));
  });
  it.each(["google", "apple"] as const)("starts %s authentication through the configured provider wrapper", async (provider) => {
    await signInProvider(provider, "https://shop.test/account-migration");
    expect(lovableOAuth).toHaveBeenCalledWith(provider, { redirect_uri: "https://shop.test/account-migration" });
  });
  it("requires a verified current identity before linking and reports collisions clearly", async () => {
    auth.getUser.mockResolvedValueOnce({ data: { user: { ...verifiedUser, email_confirmed_at: null } }, error: null });
    await expect(linkProvider("apple")).rejects.toThrow(/verified account/i);
    expect(auth.linkIdentity).not.toHaveBeenCalled();
    auth.linkIdentity.mockResolvedValueOnce({ data: { identity: null }, error: new Error("identity already linked") });
    await expect(linkProvider("google")).rejects.toThrow(/already linked to another account/i);
  });
  it("uses verified recovery session for owner password reset", async () => {
    await requestOwnerRecovery("owner@example.test");
    expect(auth.resetPasswordForEmail).toHaveBeenCalledWith("owner@example.test", { redirectTo: expect.stringMatching(/\/auth\/recovery$/) });
    await finishOwnerRecovery("new-secret");
    expect(auth.updateUser).toHaveBeenCalledWith({ password: "new-secret" });
  });
  it("installs and clears the shared session and has a single owner/employee logout entry", async () => {
    await installAuthSession({ accessToken: "access", refreshToken: "refresh" });
    expect(auth.setSession).toHaveBeenCalledWith({ access_token: "access", refresh_token: "refresh" });
    await clearAuthSession();
    expect(auth.signOut).toHaveBeenCalledWith({ scope: "local" });
    storeMock.get.mockReturnValue({ role: "owner" });
    await signOutUnified();
    expect(storeMock.signOut).toHaveBeenCalled();
    storeMock.get.mockReturnValue({ staff: { memberId: "m1" } });
    await signOutUnified();
    expect(staffLogout).toHaveBeenCalled();
  });
  it("expires only centrally migrated owner sessions and preserves the device account", () => {
    storeMock.get.mockReturnValue({ authMigration: { status: "complete" }, businessId: "legacy" });
    storeMock.signedIn.mockReturnValue(true);
    expect(expireMigratedOwnerSession()).toBe(true);
    expect(storeMock.signOut).toHaveBeenCalled();
    storeMock.get.mockReturnValue({ businessId: "legacy", authMigration: { status: "not_started" } });
    storeMock.signOut.mockClear();
    expect(expireMigratedOwnerSession()).toBe(false);
    expect(storeMock.signOut).not.toHaveBeenCalled();
  });
  it("resolves owner and employee contexts only from server access", async () => {
    access.mockResolvedValueOnce({ kind: "owner", account: "acct" });
    ownerContext.mockResolvedValueOnce({ account: "acct", businesses: [{ id: "b1", name: "Shop", currency: "KES", legacy_business_id: "legacy" }], locations: [], subscription: null, syncBusiness: "legacy" });
    expect(await authenticatedContext()).toMatchObject({ kind: "owner", accountId: "acct", businesses: [{ id: "b1" }] });
    access.mockResolvedValueOnce({ kind: "member", account: "acct", memberId: "m1", role: "shopkeeper", permissions: ["sales.process"], locations: [], businesses: [] });
    expect(await authenticatedContext()).toMatchObject({ kind: "member", memberId: "m1", permissions: ["sales.process"] });
  });
  it("maps common credential errors without hiding provider linking conflicts", () => {
    expect(authMessage(new Error("Invalid login credentials"))).toBe("Email or password is incorrect.");
    expect(authMessage(new Error("Email not confirmed"))).toBe("Verify your email before signing in.");
  });
});
