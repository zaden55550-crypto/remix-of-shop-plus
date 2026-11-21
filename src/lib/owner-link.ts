// Links an owner's business to their signed-in online account (email, Google or Apple). The server checks ownership itself.
// Proposed 0018's `reconcile_legacy_owner` is used when it exists; until it is applied, `connect_owner` (already live, migration
// 0009) does the same for a business no one else has linked: it creates the owner's online account if needed and links the
// business by its device id. Anything else (no session, the business linked to someone else) is an error and changes nothing.
import { connectOwner, reconcileLegacyOwner } from "@/lib/people-access.functions";

export type LinkResult = { status: "complete" | "manual_reconciliation"; account?: string | undefined; business?: string | undefined; reason?: string | undefined };
const MISSING_FUNCTION = /could not find the function|does not exist|PGRST202|schema cache/i;

export async function linkBusinessOnline(input: { legacyBusiness: string; businessName: string; currency: string; country?: string | undefined; fullName?: string | undefined }): Promise<LinkResult> {
  const place = { legacyBusiness: input.legacyBusiness, businessName: input.businessName, currency: input.currency, ...(input.country ? { country: input.country } : {}) };
  try {
    return await reconcileLegacyOwner({ data: { ...place, confirm: true } });
  } catch (e) {
    if (!MISSING_FUNCTION.test(e instanceof Error ? e.message : String(e))) throw e;
    const r = await connectOwner({ data: { ...place, accountName: input.businessName, fullName: input.fullName ?? input.businessName } });
    return { status: "complete", account: r.account, business: r.business };
  }
}

/** First sign-in with Google or Apple (or a verified email with no business yet): creates the owner's business straight away,
 *  named from the account's name (else the part of the email before @), with country and currency from this device's region,
 *  then links it online. Setup lets the owner change the name, type and phones next. Returns the new account. */
export async function createOwnerFromIdentity(language: string) {
  const { supabase } = await import("@/integrations/supabase/client");
  const { authenticatedContext } = await import("@/lib/auth-service");
  const { detectUserCountry } = await import("@/lib/world-data");
  const { randomUUID } = await import("@/lib/id");
  const { store } = await import("@/lib/shopbook");
  const { data } = await supabase.auth.getUser();
  const user = data.user;
  if (!user?.email) throw new Error("Your Google or Apple account didn't share an email address. Use email sign-up instead.");
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  const person = [meta["full_name"], meta["name"]].find((v): v is string => typeof v === "string" && !!v.trim())?.trim();
  const shopName = (person ? `${person.split(/\s+/)[0]}'s Business` : user.email.split("@")[0]!).slice(0, 80);
  const region = detectUserCountry();
  const legacyBusiness = randomUUID();
  const linked = await linkBusinessOnline({ legacyBusiness, businessName: shopName, currency: region.currencyCode, country: region.countryCode, fullName: person });
  if (linked.status !== "complete") throw new Error("The online account could not be linked safely. Contact Support.");
  const context = await authenticatedContext();
  if (context.kind !== "owner") throw new Error("This account could not be set up as an owner. Contact Support.");
  return store.register({
    language, shopName, email: user.email, password: "", currency: region.currencyCode, country: region.countryCode, businessId: legacyBusiness,
    authMigration: { status: "complete", centralUserId: user.id, ...(linked.account ? { centralAccountId: linked.account } : {}), ...(linked.business ? { centralBusinessId: linked.business } : {}), updatedAt: Date.now() },
    centralContext: { accountId: context.accountId, businesses: context.businesses, locations: context.locations, subscription: context.subscription, syncBusiness: context.syncBusiness, syncedAt: Date.now() },
  });
}
