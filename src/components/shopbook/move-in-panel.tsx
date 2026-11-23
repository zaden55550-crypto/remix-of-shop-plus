// "Bring your business over" (owner, 2026-11-23): one window for moving from another system. Drop files (or a zip) anywhere on
// Business Setup, or choose them here; the system is recognised, rows are cleaned up, everything comes over in one confirm, the last
// import can be undone for 24 hours, and anyone stuck can send the file to our team instead.
import { useEffect, useRef, useState } from "react";
import { Mail, MessageCircle, Undo2, Upload } from "lucide-react";
import { toast } from "sonner";
import { ShopButton } from "@/components/ui/shop-button";
import { FullImport } from "@/components/shopbook/full-import";
import { MOVE_GUIDES } from "@/components/shopbook/ready-to-sell";
import { undoLastImport, undoState } from "@/lib/move-in";
import { SUPPORT } from "@/lib/i18n";
import { store } from "@/lib/shopbook";
import { subscribe } from "@/lib/erp";

type Tr = (x: string) => string;

export function MoveInPanel({ tr, files, onClose }: { tr: Tr; files?: File[] | undefined; onClose: () => void }) {
  const [picked, setPicked] = useState<File[] | undefined>(files);
  const [guide, setGuide] = useState<string | null>(null);
  const [, bump] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => subscribe(() => bump((n) => n + 1)), []);
  const undo = undoState();
  const business = store.get()?.shopName ?? "";
  const message = `${tr("Hello Zakrio Systems team, please help me bring my records over from my old system.")} ${tr("Business")}: ${business}`;
  return <div className="inventory-box dash-panel movein-page">
    <div className="feature-panel-head"><h3>{tr("Bring your business over")}</h3><ShopButton variant="outline" onClick={onClose}>{tr("Done")}</ShopButton></div>
    <p className="settings-note">{tr("Drop your exports here (Excel, CSV or a zip of them). Products, stock, customers, suppliers and balances are recognised and brought over together, cleaned up first. You see everything before it is saved.")}</p>

    {!picked && <button type="button" className="movein-drop" onClick={() => input.current?.click()}
      onDragOver={(e) => { e.preventDefault(); }} onDrop={(e) => { e.preventDefault(); const list = [...e.dataTransfer.files]; if (list.length) setPicked(list); }}>
      <Upload aria-hidden /><b>{tr("Drop files here or tap to choose")}</b><small>{tr("Excel, CSV or zip · from Odoo, QuickBooks, Zoho, Loyverse, Sage or any spreadsheet")}</small>
    </button>}
    <input ref={input} hidden multiple type="file" accept=".csv,.xlsx,.xls,.zip" onChange={(e) => { const list = [...(e.target.files ?? [])]; if (list.length) setPicked(list); e.target.value = ""; }} />
    {picked && <FullImport tr={tr} files={picked} />}

    <div className="movein-help">
      <span>{tr("How to export from")}:</span>
      {MOVE_GUIDES.map((g) => <button key={g.system} type="button" className={guide === g.system ? "is-on" : undefined} onClick={() => setGuide(guide === g.system ? null : g.system)}>{tr(g.system)}</button>)}
    </div>
    {guide && <ol className="ready-guide">{MOVE_GUIDES.find((g) => g.system === guide)!.steps.map((x) => <li key={x}>{x}</li>)}</ol>}

    <div className="movein-foot">
      {undo && <div className="movein-undo">
        <ShopButton variant="outline" disabled={!undo.ok} title={undo.ok ? undefined : tr(undo.why ?? "")} onClick={() => {
          if (!window.confirm(tr("Take back the last import? Records it added are removed (products are archived) and its stock changes are reversed."))) return;
          try { undoLastImport(); toast.success(tr("The last import was undone")); bump((n) => n + 1); } catch (e) { toast.error(tr(e instanceof Error ? e.message : "Could not undo")); }
        }}><Undo2 aria-hidden /> {tr("Undo last import")}</ShopButton>
        <small>{undo.ok ? `${tr("Possible until")} ${new Date(undo.at + 24 * 3600_000).toLocaleString("en-GB")}` : tr(undo.why ?? "")}</small>
      </div>}
      <div className="movein-team">
        <span>{tr("Stuck? Send us your file and our team will do it for you.")}</span>
        <a className="movein-btn is-whatsapp" href={`https://wa.me/${SUPPORT.whatsapp}?text=${encodeURIComponent(message)}`} target="_blank" rel="noopener"><MessageCircle aria-hidden /> WhatsApp</a>
        <a className="movein-btn is-mail" href={`mailto:${SUPPORT.email}?subject=${encodeURIComponent(tr("Please import my records"))}&body=${encodeURIComponent(`${message}\n\n${tr("Attach your export files to this email.")}`)}`}><Mail aria-hidden /> {tr("Email")}</a>
      </div>
    </div>
  </div>;
}
