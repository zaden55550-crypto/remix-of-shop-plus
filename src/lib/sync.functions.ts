import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Json } from "@/integrations/supabase/types";
import { validateBackup } from "@/lib/backup";
import { empty } from "@/lib/erp";

export const applyOperation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value) => z.object({ id: z.string().uuid(), device: z.string().uuid(), business: z.string().min(1).max(160), kind: z.string().max(100), changes: z.array(z.object({ collection: z.string(), id: z.string(), before: z.unknown(), after: z.unknown() })), seq: z.record(z.number().int().nonnegative()) }).parse(value))
  .handler(async ({ data, context }) => {
    const collections = empty() as Record<string, unknown>;
    for (const change of data.changes) {
      if (change.collection === "seq" || !(change.collection in collections)) throw new Error("Invalid collection");
      if (change.after !== null) (collections[change.collection] as unknown[]).push(change.after);
    }
    validateBackup({ app: "SHOPBOOK", data: { ...collections, seq: data.seq } });
    const r = await context.supabase.rpc("apply_shopbook_operation", { p_operation: data.id, p_device: data.device, p_business: data.business, p_kind: data.kind, p_changes: data.changes as Json, p_seq: data.seq });
    if (r.error) throw new Error(r.error.message);
    return z.object({ revision: z.number(), acknowledgedAt: z.string(), operationId: z.string().uuid() }).parse(r.data);
  });