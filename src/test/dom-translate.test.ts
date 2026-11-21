// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { startDomTranslate } from "../lib/dom-translate";

const flush = () => new Promise((r) => setTimeout(r, 0));
let stop = () => {};
afterEach(() => { stop(); document.body.innerHTML = ""; localStorage.clear(); });

describe("page-wide translator", () => {
  it("translates known phrases printed without tr(), keeps names, and restores English", async () => {
    localStorage.setItem("shopbook.language", "Swahili");
    document.body.innerHTML = `<p id="a">Purchase Orders</p><p id="b">Sugar 1kg</p><input id="c" placeholder="Search orders..."><span id="d" translate="no">Box</span><p id="e">Name *</p>`;
    stop = startDomTranslate();
    expect(document.getElementById("a")!.textContent).toBe("Oda za manunuzi");
    expect(document.getElementById("b")!.textContent).toBe("Sugar 1kg");
    expect(document.getElementById("c")!.getAttribute("placeholder")).toBe("Tafuta oda...");
    expect(document.getElementById("d")!.textContent).toBe("Box");
    expect(document.getElementById("e")!.textContent).toBe("Jina *");

    // A screen writes new English text: it is translated too.
    document.getElementById("a")!.firstChild!.nodeValue = "No orders yet";
    await flush();
    expect(document.getElementById("a")!.textContent).toBe("Bado hakuna oda");

    localStorage.setItem("shopbook.language", "English");
    window.dispatchEvent(new Event("shopbook-language"));
    await new Promise((r) => requestAnimationFrame(() => r(null)));
    expect(document.getElementById("a")!.textContent).toBe("No orders yet");
    expect(document.getElementById("c")!.getAttribute("placeholder")).toBe("Search orders...");
  });

  it("leaves text a screen already translated alone", () => {
    localStorage.setItem("shopbook.language", "Portuguese");
    document.body.innerHTML = `<p id="a">Data</p>`; // Portuguese for "Date", not the English word "Data"
    stop = startDomTranslate();
    expect(document.getElementById("a")!.textContent).toBe("Data");
  });
});
