import { useState } from "react";
import * as XLSX from "xlsx";
import { Download, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { ShopButton } from "@/components/ui/shop-button";
import { useErp } from "@/components/shopbook/product-search";
import * as erp from "@/lib/erp";
import { APPS } from "@/lib/shopbook";
import { useSettings } from "@/lib/settings-config";
import { downloadBlob } from "@/lib/download";
import { SHEETS, iso } from "@/lib/records-export";
import { translateCurrent } from "@/lib/interface-translations";

type Tr = (x: string) => string;
const ALWAYS_ON = ["settings"];

/** Owner picks which apps show on the Apps screen. Hiding never deletes records. */
export function ManageModules({ tr }: { tr: Tr }) {
  const [cfg, save] = useSettings();
  const hidden = cfg.hiddenApps;
  const flip = (id: string, on: boolean) => { save({ hiddenApps: on ? hidden.filter((x) => x !== id) : [...hidden, id] }); toast.success(tr("Saved")); };
  return <div className="import-center">
    <p className="settings-note">{tr("Turn off apps your business does not use. They are hidden from the Apps screen; their records and history are kept and come back when you turn them on.")}</p>
    {APPS.filter((a) => !ALWAYS_ON.includes(a.id)).map((a) => <label key={a.id} className="settings-toggle"><span>{tr(a.name)}</span><input type="checkbox" checked={!hidden.includes(a.id)} onChange={(e) => flip(a.id, e.target.checked)} /></label>)}
    <p className="settings-note">{tr("Settings is always on.")}</p>
  </div>;
}

/** Add, rename and delete product categories or brands. Deleting only unlinks products. */
export function NamedManager({ kind, tr }: { kind: "categories" | "brands"; tr: Tr }) {
  const s = useErp();
  const [name, setName] = useState(""), [edit, setEdit] = useState<{ id: string; name: string } | null>(null);
  const key = kind === "brands" ? "brandId" : "categoryId";
  const run = (f: () => void, ok: string) => { try { f(); toast.success(tr(ok)); return true; } catch (e) { toast.error(translateCurrent(e instanceof Error ? e.message : "Failed")); return false; } };
  const list = s[kind];
  return <div className="import-center">
    <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (name.trim() && run(() => erp.addNamed(kind, name), "Added")) setName(""); }}>
      <input className="inventory-input" aria-label={tr(kind === "brands" ? "New brand" : "New category")} placeholder={tr(kind === "brands" ? "New brand" : "New category")} value={name} onChange={(e) => setName(e.target.value)} />
      <ShopButton type="submit" className="inventory-add-named" aria-label={tr("Add")}><Plus className="h-4 w-4" /></ShopButton>
    </form>
    {!list.length && <p className="settings-note">{tr("Nothing here yet")}</p>}
    {list.map((c) => { const n = s.products.filter((p) => p[key] === c.id).length; return <div key={c.id} className="flex items-center gap-2 border-b border-border py-1.5">
      {edit?.id === c.id
        ? <form className="flex flex-1 gap-2" onSubmit={(e) => { e.preventDefault(); if (run(() => erp.renameNamed(kind, c.id, edit.name), "Saved")) setEdit(null); }}><input autoFocus className="inventory-input" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /><ShopButton type="submit" className="inventory-add-named">{tr("Save")}</ShopButton></form>
        : <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{c.name}</p><p className="text-[11px] text-muted-foreground">{n} {tr("products")}</p></div>}
      <ShopButton variant="bare" className="inventory-icon-button" aria-label={`${tr("Rename")} ${c.name}`} onClick={() => setEdit(edit?.id === c.id ? null : { id: c.id, name: c.name })}><Pencil className="h-3.5 w-3.5" /></ShopButton>
      <ShopButton variant="bare" className="inventory-icon-button text-destructive" aria-label={`${tr("Delete")} ${c.name}`} onClick={() => { if (confirm(`${tr("Delete")} ${c.name}?`)) run(() => erp.removeNamed(kind, c.id), "Deleted"); }}><Trash2 className="h-3.5 w-3.5" /></ShopButton>
    </div>; })}
  </div>;
}


/** Full or selected workbook export, optionally filtered by date. Read-only. */
export function ExportData({ tr, shopName }: { tr: Tr; shopName: string }) {
  const s = useErp();
  const [picked, setPicked] = useState<string[]>(SHEETS.map((x) => x.name));
  const [from, setFrom] = useState(""), [to, setTo] = useState("");
  const [last, setLast] = useState<string | null>(null);
  const run = (names: string[], asCsv = false) => {
    const lo = from ? new Date(from).getTime() : -Infinity, hi = to ? new Date(to).getTime() + 86_399_999 : Infinity;
    const wb = XLSX.utils.book_new(); let total = 0;
    const day = iso(Date.now()), safe = shopName.replace(/[^\w-]+/g, "_");
    for (const sh of SHEETS.filter((x) => names.includes(x.name))) {
      const rows = sh.rows(s).filter((r) => !sh.dated || r.at === undefined || (r.at >= lo && r.at <= hi)).map((r) => r.row);
      total += rows.length;
      const ws = XLSX.utils.json_to_sheet(rows.length ? rows : [{ Note: "No records" }]);
      if (asCsv) { downloadBlob(new Blob(["\ufeff" + XLSX.utils.sheet_to_csv(ws)], { type: "text/csv;charset=utf-8" }), `${safe}-${sh.name.replace(/\s/g, "-").toLowerCase()}-${day}.csv`); }
      else XLSX.utils.book_append_sheet(wb, ws, sh.name);
    }
    if (!asCsv) {
      const info = XLSX.utils.aoa_to_sheet([["Shop", shopName], ["Generated", new Date().toLocaleString()], ["Sheets", names.join(", ")], ["From", from || "All"], ["To", to || "All"], ["Records", total], ["Note", from || to || names.length < SHEETS.length ? "Filtered export: not suitable for restoring the shop. Use Whole-shop backup to restore." : "Full export"]]);
      XLSX.utils.book_append_sheet(wb, info, "Export info");
      const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" });
      downloadBlob(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), `${safe}-export-${day}.xlsx`);
    }
    setLast(`${new Date().toLocaleTimeString()} • ${total} ${tr("records")}`);
    toast.success(tr("Export downloaded"));
  };
  const filtered = !!(from || to) || picked.length < SHEETS.length;
  return <div className="import-center">
    <ShopButton className="inventory-save" onClick={() => { setFrom(""); setTo(""); run(SHEETS.map((x) => x.name)); }}><Download className="h-4 w-4" />{tr("Export full business data (Excel)")}</ShopButton>
    <p className="money-heading">{tr("Export selected data")}</p>
    <div className="grid grid-cols-2 gap-1">{SHEETS.map((x) => <label key={x.name} className="settings-toggle"><span>{tr(x.name)}</span><input type="checkbox" checked={picked.includes(x.name)} onChange={(e) => setPicked((p) => e.target.checked ? [...p, x.name] : p.filter((n) => n !== x.name))} /></label>)}</div>
    <div className="grid grid-cols-2 gap-2"><label className="text-xs">{tr("From")}<input type="date" className="inventory-input" value={from} onChange={(e) => setFrom(e.target.value)} /></label><label className="text-xs">{tr("To")}<input type="date" className="inventory-input" value={to} onChange={(e) => setTo(e.target.value)} /></label></div>
    <p className="settings-note">{tr("Dates filter the records that have a date.")}</p>
    {filtered && <p className="settings-note text-destructive">{tr("A filtered export cannot be used to restore your shop. Use Whole-shop backup for that.")}</p>}
    <div className="grid grid-cols-2 gap-2">
      <ShopButton variant="outline" className="inventory-save" disabled={!picked.length} onClick={() => run(picked)}><Download className="h-4 w-4" />Excel</ShopButton>
      <ShopButton variant="outline" className="inventory-save" disabled={!picked.length} onClick={() => run(picked, true)}><Download className="h-4 w-4" />CSV</ShopButton>
    </div>
    {last && <p className="settings-note">{tr("Last export")}: {last}</p>}
  </div>;
}
