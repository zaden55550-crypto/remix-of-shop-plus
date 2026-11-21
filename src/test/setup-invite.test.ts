// Business Setup › Add & Send Invitation, with the server and email provider stood in: it never claims "sent" unless the provider
// took the message, never saves anyone when the owner isn't connected, and a retry continues instead of adding the person twice.
import { beforeEach, describe, expect, it, vi } from "vitest";

const server = vi.hoisted(() => ({
  phase: "ready" as "ready" | "signed-out",
  delivery: { sent: true, via: "email" as string | null, error: null as string | null },
  create: vi.fn(), renew: vi.fn(), mirrorFails: false,
}));

vi.mock("@/lib/people-access.functions", () => ({
  createEmployeeLogin: server.create,
  renewInvitation: server.renew,
}));
vi.mock("@/lib/people-cloud", async () => {
  const erp = await import("@/lib/erp");
  const state = () => ({ phase: server.phase, account: server.phase === "ready" ? "00000000-0000-4000-8000-0000000000a1" : undefined, business: "00000000-0000-4000-8000-0000000000b1", links: {} });
  return {
    peopleCloud: state, connectPeople: async () => undefined, reloadPeople: async () => undefined,
    mirrorErpLocations: async () => [],
    // The server knows every saved location unless a test says copying failed.
    peopleData: () => ({ locations: server.mirrorFails ? [] : erp.load().locations.map((l) => ({ id: `srv-${l.id}`, erpRef: l.id, status: "active" })), businesses: [] }),
    friendly: (e: unknown) => (e instanceof Error ? e.message : "Failed"),
  };
});

import * as erp from "@/lib/erp";
import { saveLocation } from "@/lib/locations";
import { NeedsConnection, sendSetupInvitation, stageOf } from "@/lib/setup-invite";

const person = { name: "Asha Noor", email: "asha@gmail.com", phone: "", role: "shopkeeper" };

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem("shopbook.account", JSON.stringify({ shopName: "T", email: "owner@x.co", password: "p", currency: "KES", plan: "business", businessId: "b1" }));
  server.phase = "ready"; server.mirrorFails = false;
  server.delivery = { sent: true, via: "email", error: null };
  server.create.mockReset().mockImplementation(async () => ({ link: "secret", expiresAt: "2026-11-15", invitationId: "i1", memberId: "00000000-0000-4000-8000-0000000000c1", delivery: server.delivery }));
  server.renew.mockReset().mockImplementation(async () => ({ link: "secret2", expiresAt: "2026-11-16", invitationId: "i2", delivery: server.delivery }));
});

describe("Add & Send Invitation from setup", () => {
  it("creates the employee and the login, limited to the chosen site, and reports the provider's real answer", async () => {
    const shop = saveLocation({ name: "Shulub", type: "shop" });
    const out = await sendSetupInvitation(person, [shop.id], {});
    expect(out).toMatchObject({ sent: true, via: "email", memberId: "00000000-0000-4000-8000-0000000000c1" });
    expect(server.create).toHaveBeenCalledTimes(1);
    expect(server.create.mock.calls[0]![0].data).toMatchObject({ email: "asha@gmail.com", role: "shopkeeper", locations: [`srv-${shop.id}`] });
    const e = erp.load().employees.find((x) => x.id === out.employeeId);
    expect(e).toMatchObject({ name: "Asha Noor", email: "asha@gmail.com", accessRole: "shopkeeper", memberId: "00000000-0000-4000-8000-0000000000c1", locationIds: [shop.id] });
    expect(JSON.stringify(out)).not.toContain("secret"); // the link itself is never kept or shown here
  });

  it("saves nobody and sends nothing when the owner isn't connected to the server", async () => {
    server.phase = "signed-out";
    const shop = saveLocation({ name: "Shulub", type: "shop" });
    await expect(sendSetupInvitation(person, [shop.id], {})).rejects.toBeInstanceOf(NeedsConnection);
    expect(erp.load().employees).toHaveLength(0);
    expect(server.create).not.toHaveBeenCalled();
  });

  it("says when the email wasn't sent, and the retry only re-sends", async () => {
    server.delivery = { sent: false, via: null, error: "No email or SMS provider is configured for this contact" };
    const shop = saveLocation({ name: "Shulub", type: "shop" });
    const first = await sendSetupInvitation(person, [shop.id], {});
    expect(first).toMatchObject({ sent: false, error: "No email or SMS provider is configured for this contact" });
    server.delivery = { sent: true, via: "email", error: null };
    const again = await sendSetupInvitation(person, [shop.id], first);
    expect(again.sent).toBe(true);
    expect(server.create).toHaveBeenCalledTimes(1);
    expect(server.renew).toHaveBeenCalledTimes(1);
    expect(erp.load().employees).toHaveLength(1);
  });

  it("carries its progress on a failure after the employee exists, so the retry doesn't add them twice", async () => {
    server.mirrorFails = true;
    const shop = saveLocation({ name: "Shulub", type: "shop" });
    const err = await sendSetupInvitation(person, [shop.id], {}).catch((e: unknown) => e);
    const stage = stageOf(err);
    expect(stage?.employeeId).toBeTruthy();
    server.mirrorFails = false;
    const out = await sendSetupInvitation(person, [shop.id], stage!);
    expect(out.sent).toBe(true);
    expect(erp.load().employees).toHaveLength(1);
  });
});
