// Linking a business to the owner's online account: 0018's reconcile when it exists, connect_owner (live since 0009) until then.
import { beforeEach, describe, expect, it, vi } from "vitest";
const { reconcileLegacyOwner, connectOwner } = vi.hoisted(() => ({ reconcileLegacyOwner: vi.fn(), connectOwner: vi.fn() }));
vi.mock("@/lib/people-access.functions", () => ({ reconcileLegacyOwner, connectOwner }));
const getUser = vi.hoisted(() => vi.fn());
vi.mock("@/integrations/supabase/client", () => ({ supabase: { auth: { getUser } } }));
vi.mock("@/lib/auth-service", () => ({ authenticatedContext: async () => ({ kind: "owner", accountId: "acc1", businesses: [], locations: [], subscription: null, syncBusiness: null }) }));
vi.mock("@/lib/world-data", () => ({ detectUserCountry: () => ({ countryCode: "KEN", currencyCode: "KES" }) }));
import { createOwnerFromIdentity, linkBusinessOnline } from "@/lib/owner-link";
import { store } from "@/lib/shopbook";

const input = { legacyBusiness: "biz-1", businessName: "Mama Njeri", currency: "KES", country: "KEN" };
beforeEach(() => { reconcileLegacyOwner.mockReset(); connectOwner.mockReset(); });

describe("linking a business online", () => {
  it("uses reconcile_legacy_owner when the server has it", async () => {
    reconcileLegacyOwner.mockResolvedValue({ status: "complete", account: "a1", business: "b1" });
    expect(await linkBusinessOnline(input)).toEqual({ status: "complete", account: "a1", business: "b1" });
    expect(connectOwner).not.toHaveBeenCalled();
  });
  it("falls back to connect_owner while 0018 isn't applied", async () => {
    reconcileLegacyOwner.mockRejectedValue(new Error("Could not find the function public.reconcile_legacy_owner in the schema cache"));
    connectOwner.mockResolvedValue({ account: "a2", business: "b2" });
    expect(await linkBusinessOnline(input)).toEqual({ status: "complete", account: "a2", business: "b2" });
    expect(connectOwner).toHaveBeenCalledWith({ data: expect.objectContaining({ legacyBusiness: "biz-1", businessName: "Mama Njeri", accountName: "Mama Njeri" }) });
  });
  it("never falls back on a real refusal, such as a business linked to someone else", async () => {
    reconcileLegacyOwner.mockRejectedValue(new Error("This business is linked to another owner"));
    await expect(linkBusinessOnline(input)).rejects.toThrow(/another owner/);
    expect(connectOwner).not.toHaveBeenCalled();
  });
});

describe("first sign-in with Google or Apple", () => {
  it("creates the owner's business straight away, linked online, named from the account", async () => {
    localStorage.clear();
    getUser.mockResolvedValue({ data: { user: { id: "g1", email: "amina@gmail.com", user_metadata: { full_name: "Amina Wanjiru" } } } });
    reconcileLegacyOwner.mockResolvedValue({ status: "complete", account: "acc1", business: "b1" });
    await createOwnerFromIdentity("en");
    expect(store.get()).toMatchObject({ shopName: "Amina's Business", email: "amina@gmail.com", currency: "KES", country: "KEN", password: "", authMigration: { status: "complete", centralUserId: "g1", centralAccountId: "acc1" } });
    expect(store.signedIn()).toBe(true);
  });
  it("refuses an account that shares no email, saving nothing", async () => {
    localStorage.clear();
    getUser.mockResolvedValue({ data: { user: { id: "a1", email: null, user_metadata: {} } } });
    await expect(createOwnerFromIdentity("en")).rejects.toThrow(/didn't share an email/);
    expect(store.get()).toBeNull();
  });
});
