// Starting settings from the business's country (owner, 2026-11-22, like Zoho's setup): time zone, date format and the usual VAT
// rate. Applied on Activate only where the owner hasn't already chosen something, so nothing they set is overwritten.
export type CountryDefaults = { timezone: string; dateFormat: string; vatRate: number };
const BY_CODE: Record<string, CountryDefaults> = {
  KEN: { timezone: "Africa/Nairobi", dateFormat: "DD/MM/YYYY", vatRate: 16 },
  UGA: { timezone: "Africa/Kampala", dateFormat: "DD/MM/YYYY", vatRate: 18 },
  TZA: { timezone: "Africa/Dar_es_Salaam", dateFormat: "DD/MM/YYYY", vatRate: 18 },
  RWA: { timezone: "Africa/Kigali", dateFormat: "DD/MM/YYYY", vatRate: 18 },
  BDI: { timezone: "Africa/Bujumbura", dateFormat: "DD/MM/YYYY", vatRate: 18 },
  ETH: { timezone: "Africa/Addis_Ababa", dateFormat: "DD/MM/YYYY", vatRate: 15 },
  SOM: { timezone: "Africa/Mogadishu", dateFormat: "DD/MM/YYYY", vatRate: 0 },
  SSD: { timezone: "Africa/Juba", dateFormat: "DD/MM/YYYY", vatRate: 18 },
  NGA: { timezone: "Africa/Lagos", dateFormat: "DD/MM/YYYY", vatRate: 7.5 },
  GHA: { timezone: "Africa/Accra", dateFormat: "DD/MM/YYYY", vatRate: 15 },
  ZAF: { timezone: "Africa/Johannesburg", dateFormat: "YYYY/MM/DD", vatRate: 15 },
  EGY: { timezone: "Africa/Cairo", dateFormat: "DD/MM/YYYY", vatRate: 14 },
  ARE: { timezone: "Asia/Dubai", dateFormat: "DD/MM/YYYY", vatRate: 5 },
  SAU: { timezone: "Asia/Riyadh", dateFormat: "DD/MM/YYYY", vatRate: 15 },
  IND: { timezone: "Asia/Kolkata", dateFormat: "DD/MM/YYYY", vatRate: 18 },
  GBR: { timezone: "Europe/London", dateFormat: "DD/MM/YYYY", vatRate: 20 },
  USA: { timezone: "America/New_York", dateFormat: "MM/DD/YYYY", vatRate: 0 },
  CAN: { timezone: "America/Toronto", dateFormat: "YYYY-MM-DD", vatRate: 5 },
};
/** The starting settings for a country code (ISO 3166 alpha-3, as Create Account stores it), or undefined when we don't know it. */
export const countryDefaults = (code?: string | null): CountryDefaults | undefined => (code ? BY_CODE[code.toUpperCase()] : undefined);
