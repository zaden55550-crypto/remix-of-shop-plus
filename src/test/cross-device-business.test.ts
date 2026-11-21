// Two devices of one owner, through the real sync function on a PostgreSQL engine with every migration in deployment order
// (including proposed 0019 and 0020 — applied only in this test database). Device A creates a second business with its own
// location, payment settings, added method and records; device B starts from the server's copy, works in that business and
// sends its own records back. Device-only settings are checked too: they travel in backups, not through sync.
import { PGlite } from "@electric-sql/pglite";
import { beforeEach, describe, expect, it } from "vitest";
import * as erp from "@/lib/erp";
import * as fin from "@/lib/finance";
import { createBusiness, openBusiness } from "@/lib/businesses";
import { businessTypesForFamily } from "@/lib/industry-config";
import { getOutbox, persistErp } from "@/lib/outbox";
import { mergeErp } from "@/lib/shop-sync";
import { scopeToBusiness } from "@/lib/shop-scope";
import { readSettings, saveSettings } from "@/lib/settings-config";
import { applyChain } from "./migration-chain";

const OWNER = "00000000-0000-4000-8000-000000000001";
let db: PGlite;
async function flush() {
  const refused: string[] = [];
  for (const op of getOutbox().filter((o) => o.phase !== "synced")) {
    await db.exec(`RESET ROLE; SELECT set_config('test.uid','${OWNER}',false); SET ROLE authenticated`);
    try { await db.query("SELECT public.apply_shopbook_operation($1,$2,$3,$4,$5::jsonb,$6::jsonb)", [op.id, op.device, op.business, op.kind, JSON.stringify(op.changes), JSON.stringify(op.seq)]); }
    catch (e) { refused.push(`${op.kind}: ${(e as Error).message}`); }
    finally { await db.exec("RESET ROLE"); }
  }
  const raw = JSON.parse(localStorage.getItem("shopbook.erp") || "{}");
  raw.__outbox = []; localStorage.setItem("shopbook.erp", JSON.stringify(raw));
  return refused;
}
const server = async () => (await db.query<{ payload: erp.ErpState }>("SELECT payload FROM public.shopbook_shop_sync WHERE user_id = $1", [OWNER])).rows[0]!.payload;
const account = () => localStorage.setItem("shopbook.account", JSON.stringify({ shopName: "Duka Kuu", email: "o@x.co", password: "p", currency: "KSH", country: "KEN", plan: "business", businessId: "b1", industryFamilyId: "trade" }));
/** A second device of the same owner: its own storage, starting from what the server holds. */
async function secondDevice() {
  const payload = await server();
  localStorage.clear(); account();
  localStorage.setItem("shopbook.syncInitialized", "1"); localStorage.setItem("shopbook.deviceId", "00000000-0000-4000-8000-0000000000b2");
  persistErp(mergeErp(erp.empty(), { ...erp.empty(), ...payload }), []);
}

beforeEach(async () => {
  localStorage.clear(); account();
  localStorage.setItem("shopbook.syncInitialized", "1");
  db = new PGlite();
  await applyChain(db);
});

describe("a second business across two devices (migrated test database)", () => {
  it("reaches the other device with its identity, location, payment settings, numbering and records, and comes back", async () => {
    const b = createBusiness({ name: "Kampala Cafe", industryFamilyId: "hospitality", businessType: businessTypesForFamily("hospitality")[0]!.name, phone: "+256700000001", country: "UGA", currency: "UGX" }, { name: "Cafe Shop", type: "shop" });
    openBusiness(erp.load(), b.id);
    fin.renameMoneyAccount("cash", "Cash Box");
    const airtel = fin.addMoneyAccount("Airtel Money", "mobile");
    const tea = erp.addProduct({ name: "Tea", buy: 10, sell: 30, qty: 20 });
    const first = erp.confirmSale({ cart: [{ productId: tea.id, qty: 1 }], discount: 0, pay: { cash: 0, mpesa: 0, bank: 0, credit: 0, [airtel.id]: 30 }, channel: "POS" });
    saveSettings({ taxPin: "CAFE-PIN" });
    expect(await flush()).toEqual([]);

    await secondDevice();
    const s = erp.load();
    expect(erp.listBusinesses(s).map((x) => [x.name, x.code])).toEqual([["Duka Kuu", undefined], ["Kampala Cafe", "B2"]]);
    expect(s.businesses[0]).toMatchObject({ industryFamilyId: "hospitality", country: "UGA", currency: "UGX", paymentSettings: { cash: { name: "Cash Box" }, mpesa: { name: "Mobile Money" } } });
    const cafe = scopeToBusiness(s, b.id);
    expect(cafe.locations.map((l) => l.name)).toEqual(["Cafe Shop"]);
    expect(erp.paymentMethods(cafe).map((m) => m.name)).toEqual(["Cash Box", "Mobile Money", "Bank", "Airtel Money"]);
    expect(erp.paymentMethods(scopeToBusiness(s, erp.MAIN_BUSINESS)).map((m) => m.name)).toEqual(["Cash", "M-Pesa", "Bank"]);
    expect(cafe.sales.map((x) => x.ref)).toEqual([first.ref]);
    expect(scopeToBusiness(s, erp.MAIN_BUSINESS).sales).toEqual([]);

    // Device-only settings are not part of sync: they move with backups (backup.ts, version 3).
    openBusiness(erp.load(), b.id);
    expect(readSettings().taxPin).toBe("");

    // The second device works in the same business; its number follows the first device's, and it goes back to the server.
    const second = erp.confirmSale({ cart: [{ productId: tea.id, qty: 2 }], discount: 0, pay: { cash: 60, mpesa: 0, bank: 0, credit: 0 }, channel: "POS" });
    expect(second.ref).toBe(first.ref.replace(/000001$/, "000002"));
    expect(await flush()).toEqual([]);
    const remote = await server();
    expect(remote.sales.filter((x) => x.businessId === b.id).map((x) => x.ref).sort()).toEqual([first.ref, second.ref].sort());
    expect(remote.seq[`SALE@${b.id}`] ?? Object.entries(remote.seq).find(([k]) => k.endsWith(`@${b.id}`))?.[1]).toBe(2);
  });

  it("without 0019 a new business (saved together with its first location) is refused as one operation and waits on the device", async () => {
    await db.exec((await import("node:fs")).readFileSync("drizzle/proposed/rollback/0020_member_business_access.down.sql", "utf8"));
    await db.exec((await import("node:fs")).readFileSync("drizzle/proposed/rollback/0019_sync_businesses.down.sql", "utf8"));
    createBusiness({ name: "Kampala Cafe", industryFamilyId: "hospitality", businessType: businessTypesForFamily("hospitality")[0]!.name, phone: "+256700000001", country: "UGA", currency: "UGX" }, { name: "Cafe Shop", type: "shop" });
    const refused = await flush();
    expect(refused).toHaveLength(1);
    expect(refused[0]).toMatch(/Invalid record collection/);
  });
});
