// Sends an invitation or reset link through whichever provider has been configured. It reports what really happened,
// so the screen can never say "sent" when nothing left. Set in the server's environment:
//   Email: RESEND_API_KEY (sender info@dataquillsolutions.com, or INVITE_EMAIL_FROM)        SMS: AFRICASTALKING_API_KEY, AFRICASTALKING_USERNAME (optional AFRICASTALKING_SENDER_ID)

import { senderFrom } from "@/lib/email-sender";

export type Delivery = { sent: boolean; via: "email" | "sms" | null; error: string | null };
type Env = Record<string, string | undefined>;
export type Contact = { name?: string | null; email?: string | null; phone?: string | null; shop?: string | null; kind?: string | null };

export const providerStatus = (env: Env = process.env) => ({
  email: Boolean(env["RESEND_API_KEY"]),
  sms: Boolean(env["AFRICASTALKING_API_KEY"] && env["AFRICASTALKING_USERNAME"]),
});

const words = (c: Contact, link: string) => {
  const shop = c.shop || "your employer";
  return c.kind === "reset"
    ? { subject: `Reset your DataQuill Solutions password`, body: `${c.name ?? "Hello"}, ${shop} issued you a link to set a new DataQuill Solutions password. It works once: ${link}` }
    : { subject: `You're invited to ${shop} on DataQuill Solutions`, body: `${c.name ?? "Hello"}, ${shop} invited you to DataQuill Solutions. Open this link to create your own password. It works once: ${link}` };
};

export async function deliverLink(c: Contact, link: string, env: Env = process.env, send: typeof fetch = fetch): Promise<Delivery> {
  const on = providerStatus(env), text = words(c, link);
  let error: string | null = null;
  if (c.email && on.email) {
    try {
      const r = await send("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${env["RESEND_API_KEY"]}`, "Content-Type": "application/json" }, body: JSON.stringify({ from: senderFrom(env["INVITE_EMAIL_FROM"]), to: c.email, subject: text.subject, text: text.body }) });
      if (r.ok) return { sent: true, via: "email", error: null };
      error = `Email provider refused the message (${r.status})`;
    } catch { error = "Email provider could not be reached"; }
  }
  if (c.phone && on.sms) {
    try {
      const form = new URLSearchParams({ username: env["AFRICASTALKING_USERNAME"] ?? "", to: c.phone, message: text.body });
      if (env["AFRICASTALKING_SENDER_ID"]) form.set("from", env["AFRICASTALKING_SENDER_ID"] ?? "");
      const r = await send("https://api.africastalking.com/version1/messaging", { method: "POST", headers: { apiKey: env["AFRICASTALKING_API_KEY"] ?? "", Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" }, body: form.toString() });
      const status = r.ok ? ((await r.json()) as { SMSMessageData?: { Recipients?: { status?: string }[] } }).SMSMessageData?.Recipients?.[0]?.status : undefined;
      if (status === "Success") return { sent: true, via: "sms", error: null };
      error = `SMS provider did not accept the message${status ? ` (${status})` : ""}`;
    } catch { error = "SMS provider could not be reached"; }
  }
  return { sent: false, via: null, error: error ?? "No email or SMS provider is configured for this contact" };
}
