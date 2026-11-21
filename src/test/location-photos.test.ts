import { beforeEach, describe, expect, it } from "vitest";
import { load } from "../lib/erp";
import { listLocations, saveLocation } from "../lib/locations";

const pic = (n: number) => `data:image/jpeg;base64,${"A".repeat(8)}${n}`;

describe("location photos", () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem("shopbook.account", JSON.stringify({ shopName: "Zakaria Aden Roble", email: "o@x.co", currency: "KES", password: "x", plan: "business" }));
    localStorage.setItem("shopbook.session", "1");
  });

  it("keeps photos when a later save doesn't mention them", () => {
    const shop = saveLocation({ name: "Kilimani", type: "shop", photos: [pic(1), pic(2)] });
    saveLocation({ id: shop.id, name: "Kilimani", type: "shop", address: "Argwings Kodhek Rd" });
    const again = listLocations(load()).find((l) => l.id === shop.id)!;
    expect(again.photos).toEqual([pic(1), pic(2)]);
    expect(again.address).toBe("Argwings Kodhek Rd");
  });

  it("removes photos only when asked, and allows up to four", () => {
    const shop = saveLocation({ name: "Shulub", type: "shop", photos: [pic(1)] });
    saveLocation({ id: shop.id, name: "Shulub", type: "shop", photos: [] });
    expect(listLocations(load()).find((l) => l.id === shop.id)!.photos).toBeUndefined();
    expect(() => saveLocation({ id: shop.id, name: "Shulub", type: "shop", photos: [1, 2, 3, 4, 5].map(pic) })).toThrow(/up to 4 photos/);
  });

  it("only keeps real image data", () => {
    const shop = saveLocation({ name: "CBD", type: "shop", photos: ["javascript:alert(1)", pic(1)] });
    expect(listLocations(load()).find((l) => l.id === shop.id)!.photos).toEqual([pic(1)]);
  });
});
