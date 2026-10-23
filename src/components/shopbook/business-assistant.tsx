import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Send, X, ArrowUpRight } from "lucide-react";
import { ShopButton } from "@/components/ui/shop-button";
import { useLanguage } from "@/hooks/use-language";
import { useErp } from "@/components/shopbook/product-search";
import { answerShopbot, type BotAnswer } from "@/lib/shopbot";
import { store } from "@/lib/shopbook";
import { useSyncStatus } from "@/lib/shop-sync";
import { useConnectivity } from "@/lib/connectivity";
import { queryShopbot } from "@/lib/shopbot.functions";
import { cn } from "@/lib/utils";

type Message = BotAnswer & { role: "user" | "assistant"; id: number };
export function BusinessAssistant({ open, onClose, shop, currency, icon }: { open: boolean; onClose: () => void; shop: string; currency: string; icon: string }) {
  if (!open) return null;
  return <NativeSession onClose={onClose} shop={shop} currency={currency} icon={icon} />;
}
function NativeSession({ onClose, shop, currency, icon }: { onClose: () => void; shop: string; currency: string; icon: string }) {
  const { tr, dir } = useLanguage(), state = useErp(), sync = useSyncStatus(), connection = useConnectivity();
  const [messages, setMessages] = useState<Message[]>([]), [input, setInput] = useState("");
  const [topic, setTopic] = useState<string>();
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ block: "nearest" }); }, [messages]);
  useEffect(() => { const close = () => { if (!store.signedIn()) onClose(); }; window.addEventListener("shopbook-session", close); return () => window.removeEventListener("shopbook-session", close); }, [onClose]);
  const send = async (question = input) => {
    const value = question.trim(); if (!value) return;
    const allowed = store.signedIn() && store.get()?.shopName === shop;
    const answer = answerShopbot(value, { state: allowed ? state : null, allowed, currency, syncedAt: sync.at, pending: sync.pending ?? 0, online: connection.backend === "up" }, topic);
    const id = Date.now() + 1;
    setMessages((old) => [...old, { text: value, role: "user", id: id - 1 }, { ...answer, role: "assistant", id }]);
    if (answer.topic) setTopic(answer.topic); setInput("");
    if (answer.data && connection.backend === "up" && sync.phase === "live" && !sync.pending && allowed) {
      try {
        const confirmed = await queryShopbot({ data: { question: value, currency, ...(topic ? { previous: topic } : {}) } });
        if (!store.signedIn() || store.get()?.shopName !== shop) return;
        setMessages((old) => old.map((m) => m.id === id ? { ...m, ...confirmed, text: confirmed.text.replace("Device records", "Server-confirmed records") } : m));
      } catch { /* The displayed local answer retains its actual cache timestamp; never claim a server result after failure. */ }
    }
  };
  return <div className="fixed inset-0 z-50 bg-background/70 backdrop-blur-sm" onClick={onClose}>
    <section role="dialog" aria-label="ShopBot" aria-modal="true" dir={dir} className="assistant-shell" onClick={(e) => e.stopPropagation()}>
      <header><img src={icon} alt="" /><div><b>ShopBot</b><small>{shop} · {tr("One private session")}</small></div><ShopButton variant="bare" className="inventory-icon-button" aria-label={tr("Close")} onClick={onClose}><X className="h-4 w-4" /></ShopButton></header>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4" aria-live="polite">
        <p className="text-sm font-medium">{tr("Hello! 👋 I'm ShopBot. How can I help your business today?")}</p>
        {!messages.length && <div className="flex flex-wrap gap-2">{["How do I add a product?", "Today's sales", "Low stock products", "Why is a transaction waiting to sync?"].map((q) => <ShopButton key={q} variant="outline" className="h-auto w-auto max-w-full whitespace-normal px-3 py-2 text-xs" onClick={() => send(q)}>{tr(q)}</ShopButton>)}</div>}
        {messages.map((m) => <div key={m.id} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}><div className={cn("max-w-[92%] whitespace-pre-line break-words text-sm", m.role === "user" ? "rounded-lg bg-primary px-3 py-2 text-primary-foreground" : "text-foreground")}>
          {m.text}
          {m.path && <Link to={m.path} onClick={onClose} className="mt-2 flex items-center gap-1 text-xs font-semibold text-primary">{tr("Open")} {m.path.slice(1)}<ArrowUpRight className="h-3 w-3" /></Link>}
        </div></div>)}
        <div ref={end} />
      </div>
      <form className="assistant-composer" onSubmit={(e) => { e.preventDefault(); send(); }}>
        <div className="flex items-end gap-2"><textarea autoFocus rows={2} maxLength={4000} value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }} aria-label={tr("Ask ShopBot")} placeholder={tr("Ask anything about your business...")} className="min-w-0 flex-1 resize-none rounded-lg border border-border bg-background p-3 text-sm" />
        <ShopButton type="submit" aria-label={tr("Send")} disabled={!input.trim()} className="h-11 w-11 shrink-0 p-0"><Send className="h-4 w-4" /></ShopButton></div>
        <p className="mt-2 text-[10px] text-muted-foreground">{connection.backend === "up" ? tr("Device records") : tr("Offline cached data")} · {sync.at ? `${tr("Last sync")}: ${new Date(sync.at).toLocaleTimeString()}` : tr("No confirmed sync yet")}</p>
      </form>
    </section>
  </div>;
}
