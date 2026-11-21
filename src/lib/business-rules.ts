// The rules for a business's own details, shared by the Create Business form, the ERP engine (`createBusiness`,
// `updateBusiness`) and the tests. The server repeats the industry and business-type rule from its own copy of the
// catalogue (drizzle/proposed/0019_sync_businesses.sql), so a changed device can't store an incompatible pair.
import { GENERAL_TRADE, INDUSTRIES, businessTypesForFamily, isIndustryFamilyId, type IndustryFamilyId } from "@/lib/industry-config";

export type BusinessDetails = {
  name: string;
  industryFamilyId: string;
  businessType: string;
  /** Every type the business is, main first (`businessType` is the main one). Left out: just `businessType`. */
  businessTypes?: readonly string[] | undefined;
  phone: string;
  email?: string | undefined;
  country: string;
  currency: string;
};
export type FirstLocation = { name: string; type: "shop" | "warehouse"; address?: string | undefined };

export const BUSINESS_NAME_MAX = 80;
const PHONE = /^\+?[0-9][0-9 ()-]*[0-9]$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** The business types an industry may use, by their approved names. Anything else is refused. */
export function typesFor(industry: string): readonly string[] {
  return isIndustryFamilyId(industry) ? businessTypesForFamily(industry).map((t) => t.name) : [];
}
/** True only for an approved type of that same industry: Services offers Services types, never Manufacturing ones. */
export function typeBelongs(industry: string, businessType: string): boolean {
  return typesFor(industry).includes(businessType);
}
export const industryName = (id: string | undefined) => INDUSTRIES.find((i) => i.id === id)?.name;

/** Cleans what was typed: trimmed text, an upper-case currency code, an empty email left out. A Trade business with no
 *  type is General Trade; the type list always starts with the main type and holds each type once. */
export function cleanDetails(d: BusinessDetails): BusinessDetails {
  const email = d.email?.trim();
  const industry = d.industryFamilyId.trim();
  const listed = [...new Set([d.businessType, ...(d.businessTypes ?? [])].map((t) => t.trim()).filter(Boolean))];
  const types = listed.length ? listed : industry === "trade" ? [GENERAL_TRADE] : [];
  return {
    name: d.name.trim().replace(/\s+/g, " "),
    industryFamilyId: industry,
    businessType: types[0] ?? "",
    businessTypes: types,
    phone: d.phone.trim(),
    ...(email ? { email } : {}),
    country: d.country.trim(),
    currency: d.currency.trim().toUpperCase(),
  };
}

/** The first problem with a business's details, in the order the form asks for them, or null when they are complete.
 *  `taken` holds the names of the owner's other businesses (compared ignoring case and spaces). */
export function businessProblem(d: BusinessDetails, taken: readonly string[] = []): string | null {
  const c = cleanDetails(d);
  if (!c.name) return "Enter a business name";
  if (c.name.length > BUSINESS_NAME_MAX) return `A business name can be up to ${BUSINESS_NAME_MAX} characters`;
  const key = (x: string) => x.trim().replace(/\s+/g, " ").toLowerCase();
  if (taken.some((t) => key(t) === key(c.name))) return "A business with that name already exists";
  if (!isIndustryFamilyId(c.industryFamilyId)) return "Choose an industry";
  if (!c.businessType) return "Choose a business type";
  if ((c.businessTypes ?? [c.businessType]).some((t) => !typeBelongs(c.industryFamilyId, t))) return "That business type is not part of the chosen industry";
  const digits = c.phone.replace(/\D/g, "");
  if (!c.phone) return "Enter the business phone number";
  if (!PHONE.test(c.phone) || digits.length < 7 || digits.length > 15) return "Enter a valid phone number";
  if (c.email && (!EMAIL.test(c.email) || c.email.length > 120)) return "Enter a valid email address";
  if (!c.country) return "Choose a country";
  if (!/^[A-Z]{3}$/.test(c.currency)) return "Choose a currency";
  return null;
}

export function locationProblem(l: FirstLocation): string | null {
  if (!l.name.trim()) return "Enter a location name";
  if (l.name.trim().length > 60) return "A location name can be up to 60 characters";
  if (l.type !== "shop" && l.type !== "warehouse") return "Choose Shop or Warehouse";
  return null;
}

export type { IndustryFamilyId };
