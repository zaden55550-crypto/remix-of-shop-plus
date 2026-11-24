// International dialling codes for every country in the sign-up country picker (WORLD_COUNTRIES_CURRENCIES in world-data.ts),
// keyed by the same 3-letter country code. Create Account fills the phone's code from the chosen country; the person can still
// type another code. "EUR" (the Eurozone entry) is not one country, so it has no code and the box is left for the person to fill.

export const DIAL_CODES: Record<string, string> = {
  // East & Horn of Africa
  KEN: "+254", SOM: "+252", UGA: "+256", TZA: "+255", RWA: "+250", ETH: "+251", DJI: "+253", SSD: "+211", SDN: "+249", ERI: "+291",
  BDI: "+257", COD: "+243", COG: "+242",
  // Southern Africa & islands
  ZAF: "+27", ZMB: "+260", ZWE: "+263", MOZ: "+258", BWA: "+267", NAM: "+264", MWI: "+265", AGO: "+244", MDG: "+261", MUS: "+230",
  SYC: "+248", COM: "+269", SWZ: "+268", LSO: "+266",
  // West & Central Africa
  NGA: "+234", GHA: "+233", SEN: "+221", CIV: "+225", CMR: "+237", MLI: "+223", BFA: "+226", NER: "+227", GIN: "+224", BEN: "+229",
  TGO: "+228", SLE: "+232", LBR: "+231", GMB: "+220", GAB: "+241", GNQ: "+240", TCD: "+235", CAF: "+236", MRT: "+222",
  // North Africa & Middle East
  EGY: "+20", MAR: "+212", DZA: "+213", TUN: "+216", LBY: "+218", UAE: "+971", SAU: "+966", QAT: "+974", KWT: "+965", OMN: "+968",
  BHR: "+973", JOR: "+962", LBN: "+961", IRQ: "+964", SYR: "+963", YEM: "+967", TUR: "+90", IRN: "+98", ISR: "+972", PSE: "+970",
  // Americas
  USA: "+1", CAN: "+1", MEX: "+52", BRA: "+55", ARG: "+54", COL: "+57", CHL: "+56", PER: "+51", ECU: "+593", VEN: "+58", BOL: "+591",
  PRY: "+595", URY: "+598", PAN: "+507", CRI: "+506", GTM: "+502", DOM: "+1", JAM: "+1", CUB: "+53", HTI: "+509", HND: "+504",
  NIC: "+505", SLV: "+503", TTO: "+1", BHS: "+1", BRB: "+1", GUY: "+592", SUR: "+597",
  // Europe
  GBR: "+44", DEU: "+49", FRA: "+33", ITA: "+39", ESP: "+34", NLD: "+31", CHE: "+41", SWE: "+46", NOR: "+47", DNK: "+45", POL: "+48",
  BEL: "+32", AUT: "+43", IRL: "+353", PRT: "+351", GRC: "+30", FIN: "+358", CZE: "+420", ROU: "+40", HUN: "+36", UKR: "+380",
  RUS: "+7", BLR: "+375", SRB: "+381", BGR: "+359", HRV: "+385", SVK: "+421", SVN: "+386", LTU: "+370", LVA: "+371", EST: "+372",
  CYP: "+357", MLT: "+356", ISL: "+354", ALB: "+355", BIH: "+387", MKD: "+389", MNE: "+382", MDA: "+373", GEO: "+995", ARM: "+374",
  AZE: "+994",
  // Asia & Pacific
  IND: "+91", CHN: "+86", JPN: "+81", PAK: "+92", BGD: "+880", IDN: "+62", MYS: "+60", SGP: "+65", PHL: "+63", VNM: "+84", THA: "+66",
  KOR: "+82", LKA: "+94", NPL: "+977", MMR: "+95", KHM: "+855", LAO: "+856", AFG: "+93", KAZ: "+7", UZB: "+998", TKM: "+993",
  KGZ: "+996", TJK: "+992", MNG: "+976", MDV: "+960", BTN: "+975", BRN: "+673", AUS: "+61", NZL: "+64", PNG: "+675", FJI: "+679",
};

/** The dialling code for a picker country code ("KEN" -> "+254"), or "" when there is none (the Eurozone entry). */
export function dialCodeFor(countryCode: string): string {
  return DIAL_CODES[countryCode] ?? "";
}

/** Keeps a typed code to "+" and up to four digits ("254" -> "+254", "+2 5x4" -> "+254"); empty stays empty. */
export function cleanDialCode(input: string): string {
  const digits = input.replace(/\D/g, "").slice(0, 4);
  return digits ? `+${digits}` : "";
}

/** Splits a typed phone into its leading "+code" and the rest ("+254 712 345 678" -> { code: "+254", local: "712 345 678" }).
 *  Without a leading "+" the whole value is the local number. The code is the longest known one the digits start with. */
export function splitPhone(value: string): { code: string; local: string } {
  const v = value.trimStart();
  if (!v.startsWith("+")) return { code: "", local: v.trim() };
  const digits = v.slice(1).replace(/^(\d{0,4}).*$/s, "$1");
  const known = new Set(Object.values(DIAL_CODES));
  let len = 0;
  for (let n = Math.min(4, digits.length); n >= 1; n--) if (known.has(`+${digits.slice(0, n)}`)) { len = n; break; }
  // A space after the code always ends it, so an unknown code the person typed is still kept apart from the number.
  const spaced = v.match(/^\+(\d{1,4})\s/);
  if (spaced?.[1]) len = spaced[1].length;
  if (!len) len = digits.length;
  const code = len ? `+${digits.slice(0, len)}` : "+";
  return { code, local: v.slice(1 + len).trim() };
}

/** The phone box with its code set to `dialCode`, keeping whatever number was typed after it ("+254 712" -> "+252 712"). */
export function withDialCode(value: string, dialCode: string): string {
  const { local } = splitPhone(value);
  return dialCode ? `${dialCode} ${local}` : local;
}

/** The short country code to show beside the phone box: the chosen country when its code is the one typed, otherwise the first
 *  country using the typed code ("+252" -> "SOM"), or "" for a code no country in the list uses. */
export function countryForDial(code: string, chosen: string): string {
  if (!code || code === "+") return "";
  if (DIAL_CODES[chosen] === code) return chosen;
  return Object.keys(DIAL_CODES).find((c) => DIAL_CODES[c] === code) ?? "";
}

/**
 * The number saved on the account, or "" when only a code was typed. One leading 0 (the trunk prefix used inside the country)
 * is dropped after the code, except for Italy (+39), where it is part of the number: "+254 0712 345 678" -> "+254 712 345 678".
 */
export function phoneToSave(value: string): string {
  const { code, local } = splitPhone(value);
  if (!/\d/.test(local)) return "";
  if (!code) return local;
  const number = code === "+39" ? local : local.replace(/^0(?=\d)/, "");
  return `${code} ${number}`;
}

/** A number written the way people in that country dial it at home (owner, 2026-11-23): "+254 722 569460" → "0722569460" when the
 *  business is in Kenya. Numbers from other countries, and ones without a code, are left as they are. Display and editing only. */
export function localPhone(value: string | undefined, countryCode: string | undefined): string {
  const v = (value ?? "").trim();
  const dial = countryCode ? dialCodeFor(countryCode) : "";
  if (!v || !dial) return v;
  const compact = v.replace(/[\s\-()]/g, "");
  const code = dial.replace(/\s/g, "");
  if (!compact.startsWith(code)) return v;
  const rest = compact.slice(code.length);
  return code === "+39" ? rest : `0${rest.replace(/^0/, "")}`;
}

/** A gentle check while typing a Kenyan number (owner, 2026-11-24): mobile numbers are 07… or 01… (9 digits after +254). Advice only;
 *  the form's own check still decides. Other countries get no hint. */
export function kenyaPhoneHint(dial: string, phone: string): string {
  const raw = phone.replace(/\D/g, "");
  const kenya = dial.replace(/\s/g, "") === "+254" || phone.trim().startsWith("+254");
  if (!kenya || raw.length < 2) return "";
  const local = raw.replace(/^254/, "").replace(/^0/, "");
  if (!/^[71]/.test(local)) return "Kenyan mobile numbers start with 07 or 01";
  if (local.length > 9) return "That's too many digits for a Kenyan number";
  return "";
}

