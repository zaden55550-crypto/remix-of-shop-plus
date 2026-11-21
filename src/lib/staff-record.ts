// What an employee's sale changes in the owner's records, worked out on the server by the same engine the owner's device uses.
// It decides only what would change; the database applies it (apply_member_operation).
import { empty, ErpError, runIntent, uid, type ErpState, type StaffIntent } from "@/lib/erp";
import { diffRecords } from "@/lib/outbox";

export type StaffChange = { kind: string; changes: ReturnType<typeof diffRecords>; seq: Record<string, number>; refused: string | null };

/** A sale the rules refuse, such as more than the shop holds, may already have happened at the counter: two people selling the last item while offline.
 *  It stays out of the books, and the owner sees it in the audit trail so the stock can be checked. */
export function buildStaffChange(payload: Partial<ErpState>, operation: string, intent: StaffIntent, by: { shop: string; user: string }): StaffChange {
  const before: ErpState = { ...empty(), ...payload };
  const at = Math.min(intent.at, Date.now());
  try {
    const { after } = runIntent(before, operation, { ...intent, at }, { shop: by.shop, user: by.user, copy: false });
    return { kind: intent.type === "sale" ? "STAFF SALE" : "STAFF CUSTOMER", changes: diffRecords(before, after), seq: after.seq, refused: null };
  } catch (e) {
    if (!(e instanceof ErpError)) throw e;
    const row = { id: uid(), at: Date.now(), action: "STAFF REFUSED", detail: e.message, user: by.user, ...(by.shop === "loc-main" ? {} : { locationId: by.shop }) };
    return { kind: "STAFF REFUSED", changes: [{ collection: "audit", id: row.id, before: null, after: row }], seq: {}, refused: e.message };
  }
}
