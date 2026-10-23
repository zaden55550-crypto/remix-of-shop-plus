import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { answerShopbot } from "@/lib/shopbot";
import { empty, type ErpState } from "@/lib/erp";

/** Approved deterministic queries only; caller identity comes from verified authentication, never request data. */
export const queryShopbot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value) => z.object({ question: z.string().min(1).max(4000), currency: z.string().max(12), previous: z.string().max(40).optional() }).parse(value))
  .handler(async ({ data, context }) => {
    const r = await context.supabase.from("shopbook_shop_sync").select("payload,updated_at").eq("user_id", context.userId).maybeSingle();
    if (r.error) throw new Error(r.error.message);
    if (!r.data) return { text: "No server-confirmed business records are available yet. Check the connection panel for pending changes." };
    return answerShopbot(data.question, { state: { ...empty(), ...(r.data.payload as unknown as ErpState) }, allowed: true, currency: data.currency, syncedAt: new Date(r.data.updated_at).getTime(), pending: 0, online: true }, data.previous);
  });