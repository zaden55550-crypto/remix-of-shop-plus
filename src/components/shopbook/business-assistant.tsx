import { useEffect, useRef, useState } from "react";
import { useDraggable } from "@/lib/use-draggable";
import { createPortal } from "react-dom";
import { Link, useRouterState } from "@tanstack/react-router";
import { Send, X, Minus, ArrowUpRight } from "lucide-react";
import { ShopButton } from "@/components/ui/shop-button";
import { useLanguage } from "@/hooks/use-language";
import { useShopErp } from "@/components/shopbook/product-search";
import { answerShopbot, type BotAnswer } from "@/lib/shopbot";
import { chatIcons, store } from "@/lib/shopbook";
import { useSyncStatus } from "@/lib/shop-sync";
import { useConnectivity } from "@/lib/connectivity";
import { queryShopbot } from "@/lib/shopbot.functions";
import { cn } from "@/lib/utils";
import { shopbotModule, type ShopbotModule } from "@/lib/shopbot-modules";

type Message = BotAnswer & { role: "user" | "assistant"; id: number };
/** Pages before sign-in (and the support team inbox) have no business ShopBot. */
const NO_SHOPBOT = new Set(["/", "/signup", "/plans", "/setup", "/support-inbox"]);

/** The one ShopBot for the whole ERP, mounted once in __root: a floating glass button on every signed-in
 *  page and a floating panel over the bottom-right of the screen. It never docks, so the page underneath
 *  keeps its exact layout. Minimise keeps the conversation (also across modules); Close ends it. */
export function GlobalShopBot() {
  const { tr } = useLanguage();
  const path = useRouterState({ select: (r) => r.location.pathname });
  const [view, setView] = useState<"closed" | "open" | "minimised">("closed");
  // Read the device account after mount so server and first client render match.
  const [acct, setAcct] = useState<ReturnType<typeof store.get>>(null);
  useEffect(() => {
    const read = () => setAcct(store.signedIn() ? store.get() : null);
    read();
    window.addEventListener("shopbook-session", read);
    window.addEventListener("storage", read);
    return () => { window.removeEventListener("shopbook-session", read); window.removeEventListener("storage", read); };
  }, [path]);
  const carry = useDraggable("shopbook.shopbotSpot", () => setView("open"));
  const available = !!acct && !NO_SHOPBOT.has(path);
  useEffect(() => { if (!available) setView("closed"); }, [available]);
  if (!available) return null;
  const labelled = path === "/apps";
  // Rendered on <body>, outside each app screen's own width scaling, so it is sized against the real screen.
  return createPortal(<>
    {view !== "open" && <button type="button" className={cn("shopbot-fab", labelled && "shopbot-fab-labelled")} {...carry} aria-label={tr("ShopBot AI Assistant")} title={tr("ShopBot AI Assistant")}>
      <span className="shopbot-fab-orb">
        <img src={chatIcons.light} alt="" draggable={false} className="dark:hidden" />
        <img src={chatIcons.dark} alt="" draggable={false} className="hidden dark:block" />
        {view === "minimised" && <i className="shopbot-fab-dot" title={tr("Conversation in progress")} />}
      </span>
      {labelled && <span className="shopbot-fab-label">ShopBot</span>}
    </button>}
    {view !== "closed" && <NativeSession hidden={view !== "open"} module={shopbotModule(path)} onMinimise={() => setView("minimised")} onClose={() => setView("closed")} shop={acct.shopName} currency={acct.currency} icon={chatIcons.light} />}
  </>, document.body);
}

function NativeSession({ hidden, module, onMinimise, onClose, shop, currency, icon }: { hidden: boolean; module: ShopbotModule; onMinimise: () => void; onClose: () => void; shop: string; currency: string; icon: string }) {
  const { tr, dir } = useLanguage(), state = useShopErp(), sync = useSyncStatus(), connection = useConnectivity();
  const [messages, setMessages] = useState<Message[]>([]), [input, setInput] = useState("");
  const [topic, setTopic] = useState<string>();
  const end = useRef<HTMLDivElement>(null);
  const online = connection.backend === "up";
  useEffect(() => { end.current?.scrollIntoView({ block: "nearest" }); }, [messages]);
  useEffect(() => { const close = () => { if (!store.signedIn()) onClose(); }; window.addEventListener("shopbook-session", close); return () => window.removeEventListener("shopbook-session", close); }, [onClose]);
  // Escape minimises (the conversation stays), like the minimise button.
  useEffect(() => {
    if (hidden) return;
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") onMinimise(); };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [hidden, onMinimise]);
  const ask = async (questions: string[]) => { for (const q of questions) await send(q); };
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
  return <div className="shopbot-dock" hidden={hidden} onClick={(e) => e.stopPropagation()}>
    <section role="dialog" aria-modal="false" aria-label="ShopBot" dir={dir} className="assistant-shell assistant-shell-compact" onClick={(e) => e.stopPropagation()}>
      <header><img src={icon} alt="" /><div><b>SHOPBOT</b><small className={online ? "shopbot-online" : "shopbot-offline"}>{online ? tr("ONLINE") : tr("OFFLINE")}</small>{module.name && <small className="shopbot-module">{tr(module.name)}</small>}</div>
        <ShopButton variant="bare" className="inventory-icon-button" aria-label={tr("Minimise")} title={tr("Minimise")} onClick={onMinimise}><Minus className="h-4 w-4" /></ShopButton>
        <ShopButton variant="bare" className="inventory-icon-button" aria-label={tr("Close")} title={tr("Close")} onClick={onClose}><X className="h-4 w-4" /></ShopButton></header>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4" aria-live="polite">
        <p className="text-sm font-medium">{tr(module.intro)}</p>
        <div className="shopbot-actions">{module.actions.map((a) => <ShopButton key={a.label} variant="outline" className="h-auto whitespace-normal" onClick={() => void ask(a.questions)}>{tr(a.label)}</ShopButton>)}</div>
        {messages.map((m) => <div key={m.id} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}><div className={cn("max-w-[92%] whitespace-pre-line break-words text-sm", m.role === "user" ? "rounded-lg bg-primary px-3 py-2 text-primary-foreground" : "text-foreground")}>
          {m.text}
          {m.path && <Link to={m.path} onClick={onMinimise} className="mt-2 flex items-center gap-1 text-xs font-semibold text-primary">{tr("Open")} {m.path.slice(1)}<ArrowUpRight className="h-3 w-3" /></Link>}
        </div></div>)}
        <div ref={end} />
      </div>
      <form className="assistant-composer" onSubmit={(e) => { e.preventDefault(); send(); }}>
        <div className="flex items-end gap-2"><textarea autoFocus={!hidden} rows={2} maxLength={4000} value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }} aria-label={tr("Ask ShopBot")} placeholder={tr("Ask anything about your business...")} className="min-w-0 flex-1 resize-none rounded-lg border border-border bg-background p-3 text-sm" />
        <ShopButton type="submit" aria-label={tr("Send")} disabled={!input.trim()} className="h-11 w-11 shrink-0 p-0"><Send className="h-4 w-4" /></ShopButton></div>
        <p className="mt-2 text-[11px] text-muted-foreground">{online ? tr("Device records") : tr("Offline cached data")} · {sync.at ? `${tr("Last sync")}: ${new Date(sync.at).toLocaleTimeString()}` : tr("No confirmed sync yet")}</p>
      </form>
    </section>
  </div>;
}
