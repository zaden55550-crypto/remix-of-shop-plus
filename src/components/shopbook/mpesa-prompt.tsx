// M-Pesa prompt at the till (owner, 2026-11-23): when the business has connected its own Daraja account (Settings › Finance ›
// Connections) and the cashier picks M-Pesa, the customer's phone gets the payment prompt. The screen waits for Safaricom's answer
// (recorded by /api/mpesa-callback) and shows Paid with the M-Pesa receipt, or Not paid. It records nothing itself: the cashier
// completes the sale as usual once it says Paid. Without a connection (or offline) nothing shows and M-Pesa works as before.
import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Loader2, Smartphone, XCircle } from "lucide-react";
import { integrationStatus, mpesaPaymentStatus, mpesaStkPush } from "@/lib/integrations.functions";

let connected: Promise<boolean> | null = null;
/** Whether this business's M-Pesa connection is switched on (asked once per page load). */
function mpesaConnected() {
  connected ??= integrationStatus().then((r) => r.ready && r.items.some((i) => i.kind === "mpesa" && i.enabled), () => false);
  return connected;
}

type State = { phase: "idle" } | { phase: "sending" } | { phase: "waiting"; id: string } | { phase: "paid"; receipt: string } | { phase: "failed"; why: string };

export function MpesaPrompt({ total, phone, money, tr }: { total: number; phone?: string | undefined; money: (n: number) => string; tr: (x: string) => string }) {
  const [on, setOn] = useState(false), [to, setTo] = useState(phone ?? ""), [st, setSt] = useState<State>({ phase: "idle" });
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => { let live = true; if (navigator.onLine) void mpesaConnected().then((x) => { if (live) setOn(x); }); return () => { live = false; }; }, []);
  useEffect(() => { setTo(phone ?? ""); }, [phone]);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  // A new total means a new payment: start again.
  useEffect(() => { window.clearTimeout(timer.current); setSt({ phase: "idle" }); }, [total]);
  if (!on || total <= 0) return null;

  const poll = (id: string, tries = 0) => {
    timer.current = window.setTimeout(async () => {
      try {
        const r = await mpesaPaymentStatus({ data: { checkoutRequestId: id } });
        if (r.status === "paid") { setSt({ phase: "paid", receipt: r.receipt ?? "" }); return; }
        if (r.status === "failed") { setSt({ phase: "failed", why: r.result_desc ?? tr("Not paid") }); return; }
      } catch { /* keep waiting */ }
      if (tries >= 30) setSt({ phase: "failed", why: tr("No answer from M-Pesa yet. Check the customer's message before completing the sale.") });
      else poll(id, tries + 1);
    }, 4000);
  };
  const send = async () => {
    setSt({ phase: "sending" });
    try {
      const r = await mpesaStkPush({ data: { amount: total, phone: to, reference: "SALE", origin: window.location.origin } });
      setSt({ phase: "waiting", id: r.checkoutRequestId }); poll(r.checkoutRequestId);
    } catch (e) { setSt({ phase: "failed", why: e instanceof Error ? e.message : tr("Could not send") }); }
  };

  return <div className={`mpesa-prompt is-${st.phase}`}>
    <div className="mpesa-prompt-row">
      <Smartphone aria-hidden />
      <input className="inventory-input" inputMode="tel" value={to} onChange={(e) => setTo(e.target.value)} placeholder={tr("Customer's M-Pesa number")} aria-label={tr("Customer's M-Pesa number")} disabled={st.phase === "sending" || st.phase === "waiting"} />
      <button type="button" className="mpesa-prompt-send" disabled={to.replace(/\D/g, "").length < 9 || st.phase === "sending" || st.phase === "waiting"} onClick={() => void send()}>
        {st.phase === "sending" || st.phase === "waiting" ? <Loader2 aria-hidden className="animate-spin" /> : null}
        {tr(st.phase === "failed" || st.phase === "paid" ? "Send again" : "Send M-Pesa prompt")} · {money(total)}
      </button>
    </div>
    {st.phase === "waiting" && <p role="status">{tr("Waiting for the customer to enter their PIN…")}</p>}
    {st.phase === "paid" && <p role="status" className="is-ok"><CheckCircle2 aria-hidden /> {tr("Paid")} · {st.receipt} · {tr("Now complete the sale")}</p>}
    {st.phase === "failed" && <p role="alert" className="is-bad"><XCircle aria-hidden /> {tr(st.why)}</p>}
  </div>;
}
