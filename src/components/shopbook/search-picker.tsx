import { useState, type KeyboardEvent } from "react";
import { Check, ChevronDown, Plus, Search, X } from "lucide-react";
import { ShopButton } from "@/components/ui/shop-button";
import { cn } from "@/lib/utils";

export type PickItem = { id: string; label: string; hint?: string | undefined };

/**
 * Searchable choice with in-place creation. Adding never leaves the current form:
 * the new record is saved through the caller's ERP action and auto-selected.
 */
export function SearchPicker({ items, value, onChange, placeholder, addLabel, onAdd, withPhone, noneLabel, tr }: {
  items: PickItem[]; value: string; onChange: (id: string) => void; placeholder: string; addLabel: string;
  onAdd?: (name: string, phone?: string) => string | undefined; withPhone?: boolean; noneLabel?: string; tr: (s: string) => string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [adding, setAdding] = useState<null | { name: string; phone: string }>(null);
  // Remembers just-created records so the label shows before the parent list refreshes.
  const [made, setMade] = useState<PickItem[]>([]);
  const all = [...items, ...made.filter((m) => !items.some((x) => x.id === m.id))];
  const sel = all.find((x) => x.id === value);
  const list = items.filter((x) => `${x.label} ${x.hint ?? ""}`.toLowerCase().includes(q.trim().toLowerCase()));
  const exact = items.some((x) => x.label.toLowerCase() === q.trim().toLowerCase());
  const pick = (id: string) => { onChange(id); setOpen(false); setQ(""); setAdding(null); };
  const save = () => {
    if (!adding || !onAdd) return;
    const id = onAdd(adding.name, adding.phone);
    if (id) { setMade((m) => [...m, { id, label: adding.name.trim(), hint: adding.phone.trim() || undefined }]); pick(id); }
  };
  // Never a nested <form>: Enter or Save here must not submit the surrounding form and lose its draft.
  const enter = (e: KeyboardEvent) => { if (e.key === "Enter") { e.preventDefault(); e.stopPropagation(); save(); } };

  return <div className="grid gap-1">
    <button type="button" style={{ display: "flex" }} className="inventory-input flex-row items-center justify-between gap-2 text-start" aria-expanded={open} onClick={() => setOpen(!open)}>
      <span className={cn("truncate", !sel && "text-muted-foreground")}>{sel ? sel.label : (value === "" && noneLabel) || placeholder}</span>
      <ChevronDown className="h-4 w-4 shrink-0 opacity-60" />
    </button>
    {/* Pickers often sit inside a <label>; cancelling the click default stops the label re-clicking the toggle and closing this panel. */}
    {open && <div className="rounded-md border border-border bg-card p-1.5 shadow-sm" onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}>
      {adding ? <div role="group" aria-label={addLabel} className="grid gap-1.5">
        <p className="text-[11px] font-semibold">{addLabel}</p>
        <input autoFocus className="inventory-input" maxLength={100} placeholder={tr("Name")} value={adding.name} onKeyDown={enter} onChange={(e) => setAdding({ ...adding, name: e.target.value })} />
        {withPhone && <input className="inventory-input" inputMode="tel" maxLength={20} placeholder={tr("Phone (optional)")} value={adding.phone} onKeyDown={enter} onChange={(e) => setAdding({ ...adding, phone: e.target.value })} />}
        <div className="grid grid-cols-2 gap-1.5">
          <ShopButton type="button" variant="outline" className="inventory-save" onClick={() => setAdding(null)}>{tr("Cancel")}</ShopButton>
          <ShopButton type="button" className="inventory-save" onClick={(e) => { e.preventDefault(); e.stopPropagation(); save(); }}>{tr("Save")}</ShopButton>
        </div>
      </div> : <>
        <div className="relative"><Search className="pointer-events-none absolute start-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 opacity-60" />
          <input autoFocus className="inventory-input ps-7" placeholder={tr("Search...")} value={q} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); e.stopPropagation(); } }} onChange={(e) => setQ(e.target.value)} />
          {q && <button type="button" aria-label={tr("Clear")} className="absolute end-2 top-1/2 -translate-y-1/2" onClick={() => setQ("")}><X className="h-3.5 w-3.5" /></button>}</div>
        <div className="mt-1 max-h-48 overflow-y-auto">
          {noneLabel && !q && <PickRow active={value === ""} onClick={() => pick("")} label={noneLabel} />}
          {list.map((x) => <PickRow key={x.id} active={x.id === value} onClick={() => pick(x.id)} label={x.label} hint={x.hint} />)}
          {!list.length && <p className="px-2 py-1.5 text-[11px] text-muted-foreground">{tr("No matches")}</p>}
        </div>
        {onAdd && !exact && <button type="button" className="mt-1 flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-start text-[12px] font-semibold text-primary hover:bg-muted" onClick={() => setAdding({ name: q.trim(), phone: "" })}>
          <Plus className="h-3.5 w-3.5" /><span className="truncate">{addLabel}{q.trim() ? ` "${q.trim()}"` : ""}</span></button>}
      </>}
    </div>}
  </div>;
}

function PickRow({ active, onClick, label, hint }: { active: boolean; onClick: () => void; label: string; hint?: string | undefined }) {
  return <button type="button" onClick={onClick} className={cn("flex w-full items-center gap-2 rounded px-2 py-1.5 text-start text-[12px] hover:bg-muted", active && "bg-muted font-semibold")}>
    <span className="min-w-0 flex-1 truncate">{label}</span>{hint && <span className="shrink-0 text-[11px] text-muted-foreground">{hint}</span>}
    {active && <Check className="h-3.5 w-3.5 shrink-0 text-primary" />}
  </button>;
}
