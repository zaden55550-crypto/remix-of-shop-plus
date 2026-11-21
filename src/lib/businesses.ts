// Multi-business management for one owner: create a business with its first location, list the owner's businesses
// with their identity and locations, and open one. Records stay in the one ERP engine (erp.ts); each record carries
// its business (`stampBusiness`), and screens read the active business's view (`scopeToBusiness`).
import { type Account } from "@/lib/shopbook";
import { activeBusiness, addBusiness, atBusiness, ErpError, listBusinesses, load, MAIN_BUSINESS, MAIN_LOCATION, runErpTransaction, selectBusiness, type Business, type ErpState, type Location } from "@/lib/erp";
import { listLocations, saveLocation } from "@/lib/locations";
import { businessProblem, industryName, locationProblem, type BusinessDetails, type FirstLocation } from "@/lib/business-rules";
import { businessTypeByName } from "@/lib/industry-config";

export type BusinessSummary = {
  business: Business;
  industryId: string | undefined;
  industry: string | undefined;
  businessType: string | undefined;
  locations: Location[];
  active: boolean;
};

/** A business's industry: the one saved on it, or, for an older first business, the industry its saved business type belongs to. */
export function industryOf(b: Pick<Business, "industryFamilyId" | "businessType">): string | undefined {
  return b.industryFamilyId ?? (b.businessType ? businessTypeByName(b.businessType)?.familyId : undefined);
}

/** Every business of the owner with its identity and its own active locations. Pass the whole state (useErp). */
export function businessSummaries(s: ErpState): BusinessSummary[] {
  const current = activeBusiness(s), all = listLocations(s).filter((l) => l.active !== false);
  return listBusinesses(s).map((b) => {
    const industryId = industryOf(b);
    return {
      business: b,
      industryId,
      industry: industryName(industryId),
      businessType: b.businessType,
      // The first business's built-in main shop is untagged, so it is listed under the first business only.
      locations: all.filter((l) => atBusiness(l, b.id)),
      active: b.id === current,
    };
  });
}

/** The business being worked in, with its identity. */
export function currentBusiness(s: ErpState): BusinessSummary {
  const all = businessSummaries(s);
  return all.find((x) => x.active) ?? all[0]!;
}

/** Makes a business and its first location in one save: either both are recorded or neither is. The location uses the
 *  plan's shared allowance, so a full allowance refuses the whole business. The new business is not opened. */
export function createBusiness(details: BusinessDetails, location: FirstLocation): Business {
  const problem = businessProblem(details) ?? locationProblem(location);
  if (problem) throw new ErpError(problem);
  return runErpTransaction(() => {
    const b = addBusiness(details);
    saveLocation({ name: location.name.trim(), type: location.type, ...(location.address?.trim() ? { address: location.address.trim() } : {}), businessId: b.id });
    return b;
  });
}

/** Works in another business of this owner. Only a business on the owner's list can be opened. */
export function openBusiness(s: ErpState, id: string) {
  if (!listBusinesses(s).some((b) => b.id === id)) throw new ErpError("Business not found");
  selectBusiness(id === MAIN_BUSINESS ? null : id);
}

/** The account as a screen shows it: while the owner works in another business, that business's name, currency, country
 *  and industry (and no logo: the account's logo is the first business's). Display only; saving always reads the account
 *  itself (`store.update`), so the first business's details are never overwritten. */
export function forOpenBusiness(a: Account): Account {
  if (a.staff) return a;
  const s = load(), id = activeBusiness(s);
  const b = id === MAIN_BUSINESS ? undefined : s.businesses.find((x) => x.id === id);
  if (!b) return a;
  const { country: _country, phone: _phone, ...rest } = a;
  const country = b.country ?? a.country, phone = b.phone ?? a.phone;
  return { ...rest, shopName: b.name, currency: b.currency, ...(country ? { country } : {}), ...(phone ? { phone } : {}), businessType: b.businessType, businessTypes: b.businessTypes, industryFamilyId: b.industryFamilyId as Account["industryFamilyId"], logo: undefined };
}

export { MAIN_BUSINESS, MAIN_LOCATION };
