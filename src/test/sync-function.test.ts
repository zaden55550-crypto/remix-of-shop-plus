// The server's sync function on a real PostgreSQL engine. Sales and purchases must be accepted, and bad money refused.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";

const OWNER = "00000000-0000-4000-8000-000000000001", DEVICE = "00000000-0000-4000-8000-000000000002";
let db: PGlite, n = 0;
const apply = (changes: unknown[]) => { n += 1; return db.query<{ r: { revision: number } }>("SELECT apply_shopbook_operation($1, $2, 'biz', 'TEST', $3, '{}'::jsonb) AS r", [`10000000-0000-4000-8000-${String(n).padStart(12, "0")}`, DEVICE, JSON.stringify(changes)]); };
const sale = (id: string, pay: Record<string, number>, total = 100, extra = {}) => ({ collection: "sales", id, before: null, after: { id, items: [], pay, total, ...extra } });

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS; CREATE SCHEMA auth;
   CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT '${OWNER}'::uuid $$;
   CREATE TABLE public.shopbook_shop_sync (user_id uuid PRIMARY KEY, revision bigint NOT NULL DEFAULT 0, device_id uuid, payload jsonb NOT NULL DEFAULT '{}', updated_at timestamptz NOT NULL DEFAULT now());
   CREATE TABLE public.shopbook_sync_operations (user_id uuid NOT NULL, operation_id uuid NOT NULL, device_id uuid NOT NULL, business_id text NOT NULL, kind text NOT NULL, request jsonb NOT NULL, revision bigint NOT NULL, acknowledged_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (user_id, operation_id));`);
  await db.exec(readFileSync(resolve("drizzle/migrations/0010_fix_sync_payment_check.sql"), "utf8"));
}, 60000);

describe("apply_shopbook_operation", () => {
  it("accepts a sale and a purchase, which used to fail with an ambiguous column", async () => {
    await apply([sale("s1", { cash: 60, mpesa: 40 })]);
    await apply([{ collection: "purchases", id: "p1", before: null, after: { id: "p1", items: [], pay: { bank: 50 }, total: 50 } }]);
    const row = await db.query<{ payload: { sales: unknown[]; purchases: unknown[] } }>("SELECT payload FROM public.shopbook_shop_sync");
    expect(row.rows[0]?.payload.sales).toHaveLength(1);
    expect(row.rows[0]?.payload.purchases).toHaveLength(1);
  });

  it("still refuses an unknown method, a negative amount, a wrong total and credit with no customer", async () => {
    await expect(apply([sale("s2", { bitcoin: 100 })])).rejects.toThrow(/Invalid payment split/);
    await expect(apply([sale("s3", { cash: 150, mpesa: -50 })])).rejects.toThrow(/Invalid payment split/);
    await expect(apply([sale("s4", { cash: 90 })])).rejects.toThrow(/does not equal total/);
    await expect(apply([sale("s5", { credit: 100 })])).rejects.toThrow(/Credit requires a customer/);
    await apply([sale("s6", { credit: 100 }, 100, { customerId: "c1" })]);
  });
});
