// Daily backup by email (owner, 2026-11-23): the owner's device sends today's whole-business backup (backup.ts, the same file as
// Settings › Backup) and the server emails it to the signed-in owner's own address as an attachment, through the email provider
// already used for invitations (RESEND_API_KEY, INVITE_EMAIL_FROM). Nothing is stored on the server.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { senderFrom } from "@/lib/email-sender";

const env = (k: string) => (typeof process !== "undefined" ? process.env[k] : undefined) ?? "";
const b64 = (text: string) => { const bytes = new TextEncoder().encode(text); let s = ""; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(s); };

export const backupEmailReady = createServerFn({ method: "GET" }).handler(async () => ({ ready: !!env("RESEND_API_KEY") }));

export const emailBackup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v) => z.object({ business: z.string().min(1).max(120), fileName: z.string().min(5).max(120), json: z.string().min(2).max(14_000_000) }).parse(v))
  .handler(async ({ data, context }) => {
    if (!env("RESEND_API_KEY")) throw new Error("Email isn't set up on the server yet");
    const { data: u } = await (context.supabase as { auth: { getUser: () => Promise<{ data: { user: { email?: string | null } | null } }> } }).auth.getUser();
    const to = u.user?.email;
    if (!to) throw new Error("Your online account has no email address");
    const day = new Date().toLocaleDateString("en-GB");
    const r = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${env("RESEND_API_KEY")}`, "Content-Type": "application/json" }, body: JSON.stringify({
      from: senderFrom(env("INVITE_EMAIL_FROM")), to, subject: `${data.business} · backup ${day}`,
      text: `Your Zakrio Systems backup for ${data.business}, ${day}, is attached. Keep it safe: it can restore your records in Settings › Backup.`,
      attachments: [{ filename: data.fileName, content: b64(data.json) }],
    }) });
    if (!r.ok) throw new Error(((await r.json().catch(() => ({}))) as { message?: string }).message ?? "The email provider didn't send the backup");
    return { sent: true, to };
  });
