// WhatsApp and SMS send a PDF, not only text (owner, 2026-11-26). Every "WhatsApp" or "SMS" link or button in the app (receipts, the
// daily summary, credit reminders, supplier orders, invitations…) goes through here: the message becomes a PDF (simple-pdf.ts, works
// offline) and the phone's share sheet opens with it, so the owner picks WhatsApp, Messages or any other app. A browser can't attach a
// file to a WhatsApp or SMS link, so where sharing files isn't possible (most computers) the PDF is saved and the link still opens with
// the text. Support links (data-plain="1") stay plain chats.
import { shareBlob } from "@/lib/download";
import { textPdf } from "@/lib/simple-pdf";

/** The message carried by a WhatsApp or SMS link, if the link is one. */
export function messageOf(href: string): { via: "whatsapp" | "sms"; text: string } | null {
  try {
    if (/^https:\/\/(wa\.me|api\.whatsapp\.com)\//.test(href)) return { via: "whatsapp", text: new URL(href).searchParams.get("text") ?? "" };
    if (href.startsWith("sms:")) { const m = /[?&]body=([^&]*)/.exec(href); return { via: "sms", text: m ? decodeURIComponent(m[1]!) : "" }; }
  } catch { /* not a message link */ }
  return null;
}

const nameFor = (title: string) => `dataquill-solutions-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50) || "message"}.pdf`;

/** Opens a WhatsApp or SMS link, sending its message as a PDF. Returns once the share sheet or the link has opened. */
export async function openAsPdf(href: string, target = "_blank") {
  const msg = messageOf(href);
  if (!msg || !msg.text.trim()) { window.open(href, target); return; }
  const title = msg.text.split("\n").find((l) => l.trim())?.trim().slice(0, 70) || "DataQuill Solutions";
  const blob = new Blob([textPdf(title, msg.text).buffer as ArrayBuffer], { type: "application/pdf" });
  const result = await shareBlob(blob, nameFor(title), title);
  if (result === "downloaded") window.open(href, href.startsWith("sms:") ? "_self" : target);
}

/** Mounted once in __root: every WhatsApp or SMS link in the app sends a PDF. */
export function startPdfSharing() {
  const onClick = (e: MouseEvent) => {
    const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
    if (!a || e.defaultPrevented || a.dataset["plain"] === "1") return;
    const msg = messageOf(a.href);
    if (!msg || !msg.text.trim()) return;
    e.preventDefault();
    void openAsPdf(a.href, a.target || "_blank");
  };
  document.addEventListener("click", onClick);
  return () => document.removeEventListener("click", onClick);
}
