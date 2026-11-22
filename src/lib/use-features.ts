// The open business's Trade features (trade-features.ts) for screens. Follows the account, the open business and settings changes.
import { useEffect, useState } from "react";
import { forOpenBusiness } from "@/lib/businesses";
import { businessTypesOf, store } from "@/lib/shopbook";
import { currentFeatures, type FeatureId, type Features } from "@/lib/trade-features";

/** The types of the business being worked in, main first. */
export function openBusinessTypes(): readonly string[] {
  const a = store.get();
  return a ? businessTypesOf(forOpenBusiness(a)) : [];
}

export function useFeatures(): Features {
  const read = () => currentFeatures(openBusinessTypes());
  const [f, setF] = useState<Features>({ expiry: false, counters: false, vat: false, barcodes: true, weight: false, priceLevels: false });
  useEffect(() => {
    const update = () => setF(read());
    update();
    const events = ["shopbook-settings", "shopbook-prefs", "shopbook-erp", "shopbook-session", "storage"];
    for (const e of events) window.addEventListener(e, update);
    return () => { for (const e of events) window.removeEventListener(e, update); };
  }, []);
  return f;
}
export const useFeature = (id: FeatureId) => useFeatures()[id];
