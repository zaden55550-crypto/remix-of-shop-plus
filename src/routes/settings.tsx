import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { ShopButton } from "@/components/ui/shop-button";
import { useErp, inputCls } from "@/components/shopbook/product-search";
import { AppShell, dt, useAccount } from "@/components/shopbook/selling";
import { ThemeToggle } from "@/components/shopbook/ui";
import { useLanguage } from "@/hooks/use-language";
import { LANGS, NATIVE } from "@/lib/i18n";
import { APPS, canOpen, store } from "@/lib/shopbook";
import { backupJson, lastBackup, restoreJson } from "@/lib/backup";
import { clearDemoData, isDemo, isEmptyShop, loadDemoData, resetDemoData } from "@/lib/demo";
import { translateCurrent } from "@/lib/interface-translations";
import { cn } from "@/lib/utils";
import { UI_SIZES, setTax, setUiSize, usePrefs, type UiSize } from "@/lib/prefs";

export const Route = createFileRoute("/settings")({
  head: () => ({ meta: [
    { title: "Settings — SHOPBOOK ERP" },
    { name: "description", content: "Shop details, appearance, language, currency, numbering, backup, restore and audit log." },
    { property: "og:title", content: "Settings — SHOPBOOK ERP" },
    { property: "og:description", content: "Configure your SHOPBOOK shop and keep your records backed up." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: Settings,
});

const CURRENCIES = ["KSh", "USh", "TSh", "USD"];
const PREFIXES: [string, string][] = [["S", "Sales"], ["RET", "Returns"], ["PAY", "Payments"], ["PR", "Payroll"]];

function Settings() {
  const acct = useAccount("basic");
  const { tr, language, setLanguage } = useLanguage();
  const s = useErp();
  const nav = useNavigate();
  const [open, setOpen] = useState<string | null>(null);
  const [shop, setShop] = useState("");
  const [email, setEmail] = useState("");
  const [, force] = useState(0);
  const file = useRef<HTMLInputElement>(null);
  const prefs = usePrefs();
  useEffect(() => { if (acct) { setShop(acct.shopName); setEmail(acct.email); } }, [acct]);
  if (!acct) return <main className="app-screen" />;
  const save = (patch: Partial<typeof acct>) => { const a = store.get(); if (a) { store.save({ ...a, ...patch }); toast.success(tr("Saved")); force((n) => n + 1); } };
  const last = lastBackup();
  const download = () => {
    const url = URL.createObjectURL(new Blob([backupJson(acct.shopName)], { type: "application/json" }));
    const a = document.createElement("a"); a.href = url; a.download = `shopbook-backup-${new Date().toISOString().slice(0, 10)}.json`; a.click(); URL.revokeObjectURL(url);
    force((n) => n + 1);
  };
  const restore = async (f: File) => {
    if (!window.confirm(tr("Replace all records on this device with this backup?"))) return;
    try { restoreJson(await f.text()); toast.success(tr("Backup restored")); } catch (e) { toast.error(translateCurrent(e instanceof Error ? e.message : "Failed")); }
  };
  const run = (fn: () => void, ok: string) => { try { fn(); toast.success(tr(ok)); force((n) => n + 1); } catch (e) { toast.error(translateCurrent(e instanceof Error ? e.message : "Failed")); } };
  const Sec = ({ id, children }: { id: string; children: ReactNode }) => (
    <div className="border-b border-border">
      <button className="flex w-full items-center justify-between py-3.5 text-sm font-bold tracking-wide" onClick={() => setOpen(open === id ? null : id)} aria-expanded={open === id}>
        {tr(id).toUpperCase()}<ChevronDown className={cn("h-4 w-4 transition", open === id && "rotate-180")} />
      </button>
      {open === id && <div className="grid gap-2 pb-4 text-sm">{children}</div>}
    </div>
  );
  const L = ({ l, children }: { l: string; children: ReactNode }) => <label className="grid gap-1"><span className="text-xs text-muted-foreground">{tr(l)}</span>{children}</label>;
  return (
    <AppShell title="Settings" tabs={[]} tab="" setTab={() => {}}>
      <Sec id="General">
        <div className="flex items-center justify-between"><span>{tr("Appearance")}</span><ThemeToggle /></div>
        <L l="Language"><select className={inputCls} value={language} onChange={(e) => { const l = LANGS.find((x) => x === e.target.value); if (l) setLanguage(l); }}>{LANGS.map((l) => <option key={l} value={l}>{NATIVE[l]}</option>)}</select></L>
        <L l="Currency"><select className={inputCls} value={store.get()?.currency ?? "KSh"} onChange={(e) => save({ currency: e.target.value })}>{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</select></L>
      </Sec>
      <Sec id="Appearance">
        <L l="Interface size"><div className="flex gap-1">{(Object.keys(UI_SIZES) as UiSize[]).map((k) => <button key={k} onClick={() => setUiSize(k)} className={cn("flex-1 rounded-md border border-border py-2 text-xs font-semibold", prefs.size === k && "bg-primary text-primary-foreground")}>{tr(k)}</button>)}</div></L>
        <p className="text-xs text-muted-foreground">{tr("Makes all text and boxes smaller or larger. Menus and rows stay on one line.")}</p>
      </Sec>
      <Sec id="Tax & Compliance">
        <label className="flex items-center justify-between"><span>{tr("Charge VAT on sales")}</span><input type="checkbox" checked={prefs.tax.on} onChange={(e) => setTax({ ...prefs.tax, on: e.target.checked })} /></label>
        <L l="VAT rate (%)"><input className={inputCls} inputMode="decimal" defaultValue={prefs.tax.rate} key={prefs.tax.rate} onBlur={(e) => { const r = +e.target.value; if (r >= 0 && r <= 100) { setTax({ ...prefs.tax, rate: r }); toast.success(tr("Saved")); } else toast.error(tr("Enter a rate between 0 and 100")); }} /></L>
        <p className="text-xs text-muted-foreground">{tr("When on, VAT is added to every new POS and Sales total and shown on receipts. Past sales are not changed.")}</p>
      </Sec>
      <Sec id="Business">
        <L l="Shop Name"><input className={inputCls} value={shop} onChange={(e) => setShop(e.target.value)} /></L>
        <L l="Email"><input className={inputCls} type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></L>
        <ShopButton onClick={() => { if (!shop.trim() || !/^\S+@\S+\.\S+$/.test(email.trim())) { toast.error(tr("Enter a valid shop name and email")); return; } save({ shopName: shop.trim().slice(0, 80), email: email.trim() }); }}>{tr("Save")}</ShopButton>
      </Sec>
      <Sec id="Users & Access">
        <p>{acct.shopName} • <b>{tr("Admin")}</b></p>
        <p className="text-xs text-muted-foreground">{tr("Staff accounts and roles are not available yet.")}</p>
      </Sec>
      <Sec id="Features">
        {APPS.filter((a) => a.id !== "settings").map((a) => <div key={a.id} className="flex justify-between"><span>{tr(a.name)}</span><span className={canOpen(acct, a.tier) ? "text-primary" : "text-muted-foreground"}>{tr(canOpen(acct, a.tier) ? "Included" : "Upgrade Required")}</span></div>)}
      </Sec>
      <Sec id="Transaction numbering">
        {PREFIXES.map(([p, l]) => <div key={p} className="flex justify-between"><span>{tr(l)}</span><span className="tabular-nums text-muted-foreground">{tr("Next")}: {p}-{String((s.seq[p] ?? 0) + 1).padStart(6, "0")}</span></div>)}
        <p className="text-xs text-muted-foreground">{tr("Numbers are never reused, so records stay traceable.")}</p>
      </Sec>
      <Sec id="Data & System">
        <p className="text-xs text-muted-foreground">✓ {tr("Saved on this device")} • {last ? `${tr("Last backup file")}: ${dt(last)}` : tr("No backup file yet")}</p>
        <ShopButton onClick={download}>{tr("Download backup")}</ShopButton>
        <input ref={file} type="file" accept="application/json,.json" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void restore(f); e.target.value = ""; }} />
        <ShopButton variant="outline" onClick={() => file.current?.click()}>{tr("Restore backup")}</ShopButton>
        <p className="mt-2 text-xs font-bold uppercase text-muted-foreground">{tr("Audit log")}</p>
        {s.audit.length === 0 ? <p className="text-xs text-muted-foreground">{tr("No activity yet")}</p> : s.audit.slice(0, 30).map((a) => (
          <div key={a.id} className="border-b border-border py-1.5 text-xs"><b>{tr(a.action)}</b> • {a.detail}<span className="block text-muted-foreground">{a.user} • {dt(a.at)}</span></div>
        ))}
      </Sec>
      <Sec id="Demo data">
        <p className="text-xs text-muted-foreground">{tr("Sample electronics shop for testing every app. Real shops start empty.")}</p>
        {!isDemo() ? (
          <ShopButton disabled={!isEmptyShop()} onClick={() => run(() => loadDemoData(), "Demo data loaded")}>{tr("Load demo data")}</ShopButton>
        ) : (<>
          <ShopButton onClick={() => { if (window.confirm(tr("Reset demo data? A backup is kept first."))) run(() => resetDemoData(acct.shopName), "Demo data reset"); }}>{tr("Reset demo data")}</ShopButton>
          <ShopButton variant="outline" onClick={() => { if (window.confirm(tr("Remove demo data and start with an empty shop?"))) run(() => clearDemoData(acct.shopName), "Demo data removed"); }}>{tr("Remove demo data")}</ShopButton>
        </>)}
        {!isDemo() && !isEmptyShop() && <p className="text-xs text-muted-foreground">{tr("Demo data can only be loaded into an empty shop")}</p>}
      </Sec>
      <Sec id="Subscription">
        <ShopButton variant="outline" onClick={() => nav({ to: "/plans" })}>{tr("Manage Subscription")}</ShopButton>
      </Sec>
    </AppShell>
  );
}
