// First-time hints (owner, 2026-11-23): the first time each main screen opens, one short tip explains it; "Got it" hides it for good
// on this device. Mounted once in __root, so every screen gets it without changes.
import { useEffect, useState } from "react";
import { useLocation } from "@tanstack/react-router";
import { Lightbulb, X } from "lucide-react";
import { useLanguage } from "@/hooks/use-language";
import { store } from "@/lib/shopbook";

export const HINTS: Record<string, string> = {
  setup: "Fill in your business name, phone and type, add your shops and warehouses and your staff, then tap Activate.",
  apps: "Every part of your business is an app. Start with POS to sell, Inventory for stock, and Dashboard to see your day.",
  dashboard: "Your day at a glance: sales, money, what needs attention. The bell lists anything to check.",
  pos: "Tap a product to add it to the cart, or scan its barcode. Tap the cart to take payment.",
  inventory: "All your products and stock. Stock In adds goods, Stock Count checks the shelves, Reorder tells you what to buy.",
  sales: "Every sale, customer and payment. Credit book reminds customers who owe; Alerts shows anything suspicious.",
  purchases: "Record what you buy from suppliers. Stock and supplier balances update by themselves.",
  float: "Your money in cash, M-Pesa and the bank, and moves between them.",
  contacts: "Customers, suppliers and other contacts in one place.",
  settings: "Your business details, payment methods, receipts, people and access.",
};
const KEY = "shopbook.hintsSeen";
const seen = (): string[] => { try { return JSON.parse(localStorage.getItem(KEY) || "[]"); } catch { return []; } };

export function FirstTimeHint() {
  const { tr } = useLanguage();
  const { pathname } = useLocation();
  const page = pathname.split("/").filter(Boolean)[0] ?? "";
  const [show, setShow] = useState<string | null>(null);
  // Read after mount (device storage is never read during the first render); only for a signed-in owner or employee.
  useEffect(() => { setShow(HINTS[page] && store.signedIn() && !seen().includes(page) ? page : null); }, [page]);
  if (!show) return null;
  const done = () => { try { localStorage.setItem(KEY, JSON.stringify([...new Set([...seen(), show])])); } catch { /* shown again next time */ } setShow(null); };
  return <div className="first-hint" role="status">
    <Lightbulb aria-hidden className="first-hint-icon" />
    <p>{tr(HINTS[show]!)}</p>
    <button type="button" className="first-hint-ok" onClick={done}>{tr("Got it")}</button>
    <button type="button" className="first-hint-x" aria-label={tr("Close")} onClick={done}><X aria-hidden /></button>
  </div>;
}
