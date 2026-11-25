// Forgot password, sent through Resend (owner, 2026-11-25: Zakrio Systems emails people only for a forgotten password and for staff
// invitations, both through Resend; no SMS). The server makes a one-time recovery token with the sign-in system and emails a link to
// /auth/recovery on this same site (the address comes from the request, never from the browser, so a link can't be pointed elsewhere).
// It never says whether an address has an account. Without RESEND_API_KEY and INVITE_EMAIL_FROM it answers `resend: false` and the
// page falls back to the sign-in system's own reset email, so forgot password keeps working until the key is saved.
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";

const env = (k: string) => (typeof process !== "undefined" ? process.env[k] : undefined) ?? "";
/** One email per address a minute from this server instance: enough to stop someone filling an inbox, without storing anything. */
const lastSent = new Map<string, number>();

export const sendOwnerReset = createServerFn({ method: "POST" })
  .inputValidator((v) => z.object({ email: z.string().trim().toLowerCase().email().max(200) }).parse(v))
  .handler(async ({ data }) => {
    if (!env("RESEND_API_KEY") || !env("INVITE_EMAIL_FROM")) return { resend: false };
    const now = Date.now();
    if ((lastSent.get(data.email) ?? 0) > now - 60_000) return { resend: true };
    lastSent.set(data.email, now);
    const origin = new URL(getRequest().url).origin;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const r = await supabaseAdmin.auth.admin.generateLink({ type: "recovery", email: data.email });
    const token = r.data?.properties?.hashed_token;
    // No account with that email (or the sign-in system refused): say nothing different, send nothing.
    if (r.error || !token) return { resend: true };
    const link = `${origin}/auth/recovery?token_hash=${encodeURIComponent(token)}&type=recovery`;
    const sent = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${env("RESEND_API_KEY")}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: env("INVITE_EMAIL_FROM"), to: data.email, subject: "Reset your Zakrio Systems password",
        text: `Someone asked to reset the password for this email on Zakrio Systems. If it was you, open this link to choose a new password. It works once and expires soon:\n\n${link}\n\nIf it wasn't you, ignore this email; your password stays the same.`,
      }),
    }).catch(() => null);
    if (!sent?.ok) lastSent.delete(data.email);
    if (!sent?.ok) throw new Error("The email couldn't be sent right now. Try again in a minute.");
    return { resend: true };
  });
