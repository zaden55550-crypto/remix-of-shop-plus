// Invite a shop, get a free month (owner, 2026-11-24). Every owner has an invite link at once (a code made on this device, claimed on
// the server by proposed 0026 once they are online). Only invited shops that PAY for a plan count, never free trials, and how many
// earn one free month depends on the inviter's plan: Basic every 2, Growth every 3, Business every 5. Support gives the month.
import type { Account } from "@/lib/shopbook";

export type ReferralPlan = "basic" | "growth" | "business";
/** Paying shops needed for each free month, by the inviter's plan. */
export const PAID_INVITES_PER_FREE_MONTH: Record<ReferralPlan, number> = { basic: 2, growth: 3, business: 5 };

/** The plan the free months go on: the paid plan, or during the trial the plan chosen on /plans (Growth when none yet). */
export function referralPlan(a: Pick<Account, "plan" | "trialChoice"> | null | undefined): ReferralPlan {
  const p = a?.plan && a.plan !== "trial" ? a.plan : a?.trialChoice;
  return p === "basic" || p === "business" ? p : "growth";
}

/** Free months earned from paying invited shops, and how many more paying shops the next one needs. */
export function freeMonths(paid: number, plan: ReferralPlan) {
  const per = PAID_INVITES_PER_FREE_MONTH[plan];
  const n = Math.max(0, Math.floor(paid));
  return { per, earned: Math.floor(n / per), toNext: per - (n % per) };
}

const CODE_KEY = "shopbook.refCode";
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
/** A short code made from the business itself, the same every time on this device (and on any device with the same business),
 *  unless the server gave this owner a different one, which is then remembered. */
export function deviceReferralCode(a: Pick<Account, "businessId" | "email" | "shopName"> | null | undefined): string {
  try { const saved = localStorage.getItem(CODE_KEY); if (saved && /^[A-Z0-9]{6}$/.test(saved)) return saved; } catch { /* made below */ }
  const seed = `${a?.businessId || ""}|${(a?.email || "").toLowerCase()}|${a?.shopName || ""}` || "zakrio";
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  let out = "", x = h;
  for (let i = 0; i < 6; i++) { out += ALPHABET[x % ALPHABET.length]; x = (Math.floor(x / ALPHABET.length) ^ Math.imul(h, i + 7)) >>> 0; }
  return out;
}
export function rememberReferralCode(code: string) { try { localStorage.setItem(CODE_KEY, code); } catch { /* derived again next time */ } }
