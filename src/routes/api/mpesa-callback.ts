// Safaricom sends the result of each M-Pesa prompt here (Daraja STK callback). The owner id comes from the URL the server gave
// Safaricom; the row is only updated when that owner started that payment. Always answers "Accepted" so Safaricom doesn't retry.
import { createFileRoute } from "@tanstack/react-router";
import { recordMpesaCallback } from "@/lib/integrations.functions";

export const Route = createFileRoute("/api/mpesa-callback")({ server: { handlers: { POST: async ({ request }) => {
  const owner = new URL(request.url).searchParams.get("o") ?? "";
  if (/^[0-9a-f-]{36}$/i.test(owner)) { try { await recordMpesaCallback(owner, await request.json()); } catch { /* answer anyway; the payment stays pending */ } }
  return Response.json({ ResultCode: 0, ResultDesc: "Accepted" });
} } } });
