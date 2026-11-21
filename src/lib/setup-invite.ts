// Business Setup › Add & Send Invitation: the same server path as Settings › People & Access, started from setup.
// Nothing here pretends: the result is what the server and the email provider really answered, and a retry resumes from the
// step that last succeeded (the employee record, then the login and invitation, then only re-sending), so no one is created twice.
import { load } from "@/lib/erp";
import { createEmployeeLogin, renewInvitation } from "@/lib/people-access.functions";
import { linkEmployeeLogin, saveEmployeeProfile } from "@/lib/people";
import { connectPeople, mirrorErpLocations, peopleCloud, peopleData, reloadPeople } from "@/lib/people-cloud";
import { store } from "@/lib/shopbook";

/** How far a person's invitation got. Kept by the dialog between attempts. */
export type InviteStage = {
  employeeId?: string | undefined; memberId?: string | undefined;
  sent?: boolean | undefined; via?: string | null | undefined; error?: string | undefined; expiresAt?: string | undefined;
};
/** The owner isn't signed in to the server, so no login can be created yet. Nothing was saved. */
export class NeedsConnection extends Error {}

export type InvitePerson = { name: string; email: string; phone: string; role: string;
  /** Counters this person may use, per saved location id (Business Setup). */
  counters?: Record<string, number[]> | undefined };

async function server() {
  let c = peopleCloud();
  if (c.phase !== "ready" || !c.account) { await connectPeople(); c = peopleCloud(); }
  if (c.phase === "signed-out") throw new NeedsConnection("Connect your owner account to the server first");
  if (c.phase !== "ready" || !c.account) throw new Error(c.error ?? "The server couldn't be reached. Try again");
  return c;
}

/** `locationIds` are saved ERP locations (the page saves the chosen sites first). A failure after the employee record exists carries
 *  `stage` (with its employeeId) on the error, so the retry continues instead of adding the person again. */
export async function sendSetupInvitation(p: InvitePerson, locationIds: string[], stage: InviteStage): Promise<InviteStage> {
  const c = await server();
  // Already has a login: only send again. The server makes a new link and the old one stops working.
  if (stage.memberId) {
    const r = await renewInvitation({ data: { member: stage.memberId } });
    await reloadPeople();
    return { ...stage, sent: r.delivery.sent, via: r.delivery.via, error: r.delivery.error ?? undefined, expiresAt: r.expiresAt };
  }
  let employeeId = stage.employeeId;
  if (!employeeId) {
    const e = saveEmployeeProfile({ name: p.name, phone: p.phone, email: p.email, code: "", businessRefs: [store.get()?.businessId ?? ""], locationIds, accessRole: p.role, startDate: "", employmentType: "Full-time", ...(p.counters ? { counters: p.counters } : {}) });
    employeeId = e.id;
  }
  try { return await loginFor(c, employeeId, locationIds); }
  catch (e) { throw Object.assign(e instanceof Error ? e : new Error("Failed"), { stage: { ...stage, employeeId } }); }
}

/** Creates the login and invitation for a saved employee, limited to the chosen sites, and sends it. */
async function loginFor(c: Awaited<ReturnType<typeof server>>, employeeId: string, locationIds: string[]): Promise<InviteStage> {
  // The chosen sites must exist on the server before a login can be limited to them.
  const problems = await mirrorErpLocations();
  await reloadPeople();
  const d = peopleData();
  if (!d) throw new Error("The server couldn't be reached. Try again");
  const places = d.locations.filter((l) => l.status === "active" && l.erpRef && locationIds.includes(l.erpRef)).map((l) => l.id);
  if (places.length !== locationIds.length) throw new Error(problems[0] ?? "A chosen site isn't on the server yet. Try again");
  const e = load().employees.find((x) => x.id === employeeId);
  if (!e) throw new Error("Employee not found");
  const issued = await createEmployeeLogin({ data: { account: c.account!, employeeRef: e.id, fullName: e.name, phone: e.phone || null, email: e.email || null, code: e.code ?? null, role: e.accessRole ?? "staff", businesses: c.business ? [c.business] : [], locations: places } });
  linkEmployeeLogin(e.id, issued.memberId ?? null);
  await reloadPeople();
  return { employeeId, memberId: issued.memberId ?? undefined, sent: issued.delivery.sent, via: issued.delivery.via, error: issued.delivery.error ?? undefined, expiresAt: issued.expiresAt };
}
/** The progress a failed attempt reached (set when the employee record already exists). */
export const stageOf = (e: unknown): InviteStage | undefined => (e && typeof e === "object" && "stage" in e ? (e as { stage: InviteStage }).stage : undefined);
