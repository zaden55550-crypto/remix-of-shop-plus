// "Bring your business over" (owner, 2026-11-23): one window for moving from another system. Drop files (or a zip) anywhere on
// Business Setup, or choose them here; the system is recognised, rows are cleaned up, everything comes over in one confirm, the last
// import can be undone for 24 hours, and anyone stuck can send the file to our team instead.
import { useEffect, useState } from "react";
import { Mail, MessageCircle, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { ShopButton } from "@/components/ui/shop-button";
import { SmartImport } from "@/components/shopbook/smart-import";
import { undoLastImport, undoState } from "@/lib/move-in";
import { SUPPORT } from "@/lib/i18n";
import { store } from "@/lib/shopbook";
import { subscribe } from "@/lib/erp";

type Tr = (x: string) => string;

export function MoveInPanel({ tr, files, onClose }: { tr: Tr; files?: File[] | undefined; onClose: () => void }) {
  const [, bump] = useState(0);
  useEffect(() => subscribe(() => bump((n) => n + 1)), []);
  const undo = undoState();
  const business = store.get()?.shopName ?? "";
  const message = `${tr("Hello DataQuill Solutions team, please help me bring my records over from my old system.")} ${tr("Business")}: ${business}`;
  return <div className="inventory-box dash-panel movein-page">
    <div className="feature-panel-head"><h3>{tr("Bring your business over")}</h3><ShopButton variant="outline" onClick={onClose}>{tr("Done")}</ShopButton></div>
    {/* Smart Import (owner, 2026-11-23): where from · drop files · automatic check · one Import button. */}
    <SmartImport tr={tr} files={files} />

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
        <a data-plain="1" className="movein-btn is-whatsapp" href={`https://wa.me/${SUPPORT.whatsapp}?text=${encodeURIComponent(message)}`} target="_blank" rel="noopener"><MessageCircle aria-hidden /> WhatsApp</a>
        <a className="movein-btn is-mail" href={`mailto:${SUPPORT.email}?subject=${encodeURIComponent(tr("Please import my records"))}&body=${encodeURIComponent(`${message}\n\n${tr("Attach your export files to this email.")}`)}`}><Mail aria-hidden /> {tr("Email")}</a>
      </div>
    </div>
  </div>;
}
