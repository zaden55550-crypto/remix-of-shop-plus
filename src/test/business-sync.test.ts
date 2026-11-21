// The server's own check on business rows (drizzle/proposed/0019_sync_businesses.sql), on a real PostgreSQL engine with every
// migration in deployment order. Operations are built by hand, as a changed device could send them, so the server is tested
// without the app's own validation in front of it.
import { PGlite } from "@electric-sql/pglite";
import { beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { BUSINESS_TYPES, INDUSTRIES, businessTypesForFamily } from "@/lib/industry-config";
import { applyChain, proposedFile, rollbackFile } from "./migration-chain";

const OWNER = "00000000-0000-4000-8000-000000000001", DEVICE = "00000000-0000-4000-8000-0000000000d1";
let db: PGlite;
const typeOf = (industry: string, n = 0) => businessTypesForFamily(industry as never)[n]!.name;
const row = (extra: Record<string, unknown> = {}) => ({ id: "clinic1234", name: "Afya Clinic", currency: "KSH", country: "KEN", phone: "+254711000111", email: "c@x.co", industryFamilyId: "healthcare", businessType: typeOf("healthcare"), businessTypes: [typeOf("healthcare")], createdAt: 1, active: true, ...extra });

async function send(changes: { collection: string; id: string; before: unknown; after: unknown }[]) {
  await db.exec(`RESET ROLE; SELECT set_config('test.uid','${OWNER}',false); SET ROLE authenticated`);
  try { await db.query("SELECT public.apply_shopbook_operation($1,$2,$3,$4,$5::jsonb,$6::jsonb)", [randomUUID(), DEVICE, "b1", "TEST", JSON.stringify(changes), "{}"]); }
  finally { await db.exec("RESET ROLE"); }
}
const create = (r: Record<string, unknown>) => send([{ collection: "businesses", id: String(r["id"]), before: null, after: r }]);
const stored = async () => (await db.query<{ payload: { businesses?: unknown[] } }>("SELECT payload FROM public.shopbook_shop_sync WHERE user_id = $1", [OWNER])).rows[0]?.payload.businesses ?? [];

beforeEach(async () => { db = new PGlite(); await applyChain(db); });

describe("syncing businesses (proposed 0019)", () => {
  it("holds the same 111 approved business types, by industry, as the app", async () => {
    const rows = (await db.query<{ industry_id: string; business_type: string }>("SELECT industry_id, business_type FROM public.business_type_catalogue ORDER BY 1, 2")).rows;
    const app = BUSINESS_TYPES.map((t) => ({ industry_id: t.familyId, business_type: t.name })).sort((a, b) => a.industry_id.localeCompare(b.industry_id) || (a.business_type < b.business_type ? -1 : a.business_type > b.business_type ? 1 : 0));
    expect(rows).toEqual(app);
    expect(new Set(rows.map((r) => r.industry_id))).toEqual(new Set(INDUSTRIES.map((i) => i.id)));
  });

  it("accepts a valid business, a change to it and archiving it", async () => {
    await create(row());
    await send([{ collection: "businesses", id: "clinic1234", before: row(), after: row({ name: "Afya Medical" }) }]);
    await send([{ collection: "businesses", id: "clinic1234", before: row({ name: "Afya Medical" }), after: row({ name: "Afya Medical", active: false }) }]);
    expect(await stored()).toEqual([row({ name: "Afya Medical", active: false })]);
  });

  it("accepts every approved type for its own industry and refuses it for every other industry", async () => {
    let n = 0;
    for (const t of BUSINESS_TYPES) {
      const other = INDUSTRIES.find((i) => i.id !== t.familyId)!.id;
      await create(row({ id: `biz${String(++n).padStart(4, "0")}`, industryFamilyId: t.familyId, businessType: t.name, businessTypes: [t.name] }));
      await expect(create(row({ id: `bad${String(n).padStart(4, "0")}`, industryFamilyId: other, businessType: t.name, businessTypes: [t.name] }))).rejects.toThrow(/business type is not part of the industry/);
    }
    expect(await stored()).toHaveLength(111);
  });

  it("refuses an invented type, an unknown industry, and a mismatched entry in businessTypes", async () => {
    await expect(create(row({ businessType: "Space Tourism", businessTypes: ["Space Tourism"] }))).rejects.toThrow(/business type is not part of the industry/);
    await expect(create(row({ industryFamilyId: "mining" }))).rejects.toThrow(/Invalid business: industry/);
    await expect(create(row({ businessTypes: [typeOf("healthcare"), typeOf("manufacturing")] }))).rejects.toThrow(/business type is not part of the industry/);
    expect(await stored()).toEqual([]);
  });

  it("refuses a bad id, name, currency, phone, email or active flag", async () => {
    await expect(create(row({ id: "BAD ID!" }))).rejects.toThrow(/Invalid business: id/);
    await expect(create(row({ name: "  " }))).rejects.toThrow(/Invalid business: name/);
    await expect(create(row({ name: "x".repeat(81) }))).rejects.toThrow(/Invalid business: name/);
    await expect(create(row({ currency: "ksh" }))).rejects.toThrow(/Invalid business: currency/);
    await expect(create(row({ phone: "12" }))).rejects.toThrow(/Invalid business: phone/);
    await expect(create(row({ email: "nope" }))).rejects.toThrow(/Invalid business: email/);
    await expect(create(row({ active: "yes" }))).rejects.toThrow(/Invalid business: active/);
    expect(await stored()).toEqual([]);
  });

  it("never deletes a business: it can only be archived", async () => {
    await create(row());
    await expect(send([{ collection: "businesses", id: "clinic1234", before: row(), after: null }])).rejects.toThrow(/archived \(active false\), never deleted/);
    expect(await stored()).toEqual([row()]);
  });

  it("still takes an older first business saved before industries existed, when its type is an approved name", async () => {
    const legacy = { id: "biz-main", name: "TechPoint Electronics", currency: "KES", businessType: typeOf("trade"), businessTypes: [typeOf("trade")], createdAt: 1, active: true };
    await create(legacy);
    await expect(create({ ...legacy, id: "other12345", businessType: "Anything Goes", businessTypes: undefined })).rejects.toThrow(/business type is not part of the industry/);
    expect(await stored()).toEqual([legacy]);
  });

  it("refuses a business row sent through an employee's path, whatever the app server does", async () => {
    await create(row()); // the owner's records are on the server
    const ACCOUNT = "00000000-0000-4000-8000-0000000000a1", MEMBER = "00000000-0000-4000-8000-0000000000a2";
    await db.exec(`SET session_replication_role = replica;
      INSERT INTO public.owner_accounts (id, owner_user_id, name) VALUES ('${ACCOUNT}', '${OWNER}', 'Biz');
      INSERT INTO public.owner_members (id, owner_account_id, full_name, email, role, status) VALUES ('${MEMBER}', '${ACCOUNT}', 'Amina', 'a@x.co', 'shopkeeper', 'active');
      SET session_replication_role = DEFAULT;`);
    await db.exec("RESET ROLE; SET ROLE service_role");
    try {
      await expect(db.query("SELECT public.apply_member_operation($1,$2,$3,'STAFF SALE',$4::jsonb,'{}'::jsonb)", [MEMBER, randomUUID(), DEVICE, JSON.stringify([{ collection: "businesses", id: "evil123456", before: null, after: row({ id: "evil123456", name: "Taken Over" }) }])])).rejects.toThrow(/only the owner can change a business/);
    } finally { await db.exec("RESET ROLE"); }
    expect(await stored()).toEqual([row()]);
  });

  it("rolls back to refusing businesses, keeps what was stored, and can be applied again", async () => {
    await create(row());
    await db.exec(rollbackFile("0019_sync_businesses"));
    await expect(create(row({ id: "second1234" }))).rejects.toThrow(/Invalid record collection/);
    expect(await stored()).toEqual([row()]);
    await db.exec(proposedFile("0019_sync_businesses"));
    await create(row({ id: "second1234", name: "Second" }));
    expect(await stored()).toHaveLength(2);
  });
});
