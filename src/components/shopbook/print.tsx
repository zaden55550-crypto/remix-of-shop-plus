// One printing workflow for every Zakrio Systems document: white preview, Print, and an Exit that always works.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Printer, X } from "lucide-react";
import { ShopButton } from "@/components/ui/shop-button";
import { useLanguage } from "@/hooks/use-language";
import { toast } from "sonner";
import { shareBlob } from "@/lib/download";
import { tablePdf, textPdf } from "@/lib/simple-pdf";

type State = "preview" | "printing" | "finished" | "failed" | "cancelled";
const TIMEOUT = 60_000;

/**
 * The browser does not report whether paper actually came out, so after the print window
 * closes we say so honestly and offer Retry instead of claiming "Printed".
 */
export function PrintPreview({ title, onClose, children, actions }: { title: string; onClose: () => void; children: ReactNode; actions?: ReactNode }) {
  const { tr } = useLanguage();
  const [st, setSt] = useState<State>("preview");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clear = () => { if (timer.current) clearTimeout(timer.current); timer.current = null; };
  useEffect(() => {
    const after = () => { clear(); setSt((s) => (s === "printing" ? "finished" : s)); };
    window.addEventListener("afterprint", after);
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", esc);
    return () => { clear(); window.removeEventListener("afterprint", after); window.removeEventListener("keydown", esc); };
  }, [onClose]);
  const print = () => {
    setSt("printing"); clear();
    timer.current = setTimeout(() => setSt((s) => (s === "printing" ? "failed" : s)), TIMEOUT);
    // Let the "Printing..." state paint before the (blocking) print window opens.
    setTimeout(() => {
      try {
        if (typeof window.print !== "function") throw new Error("no print");
        window.print();
        // Browsers without afterprint return here once the window closes.
        if (!("onafterprint" in window)) { clear(); setSt("finished"); }
      } catch { clear(); setSt("failed"); }
    }, 60);
  };
  const msg: Record<State, string> = {
    preview: "",
    printing: "Printing...",
    finished: "Print window closed. If nothing printed, tap Retry.",
    failed: "Printing failed / Printer unavailable",
    cancelled: "Print cancelled",
  };
  return (
    <div role="dialog" aria-modal="true" aria-label={tr(title)} className="fixed inset-0 z-50 flex flex-col bg-background/95 backdrop-blur">
      <div className="mx-auto flex w-full max-w-[430px] items-center justify-between px-3 py-2.5">
        <p className="text-sm font-bold">{tr(title)}</p>
        <ShopButton variant="bare" aria-label={tr("Exit")} className="h-8 w-8 p-0" onClick={onClose}><X className="h-5 w-5" /></ShopButton>
      </div>
      <div className="mx-auto w-full max-w-[430px] flex-1 overflow-y-auto px-3 pb-3"><div className="print-area receipt-paper rounded-md p-4 text-[11px] leading-snug">{children}</div></div>
      <div className="mx-auto grid w-full max-w-[430px] gap-1.5 border-t border-border px-3 py-2.5">
        {st !== "preview" && <p role="status" className={st === "failed" ? "text-center text-xs text-destructive" : "text-center text-xs text-muted-foreground"}>{tr(msg[st])}</p>}
        {actions}
        <div className="grid grid-cols-2 gap-1.5">
          {st === "printing"
            ? <ShopButton variant="outline" className="h-9 text-sm" onClick={() => { clear(); setSt("cancelled"); }}>{tr("Cancel print")}</ShopButton>
            : <ShopButton className="h-9 text-sm" onClick={print}><Printer className="h-4 w-4" />{tr(st === "preview" ? "Print" : "Retry")}</ShopButton>}
          <ShopButton variant="outline" className="h-9 text-sm" onClick={onClose}>{tr(st === "finished" ? "Done" : "Exit")}</ShopButton>
        </div>
      </div>
    </div>
  );
}

/** Small helpers for the white document body. */
export const DocHead = ({ shop, title }: { shop: string; title: string }) => <div className="text-center"><p className="text-sm font-extrabold uppercase">{shop}</p><p className="mt-1 font-bold">{title}</p><div className="my-2 border-t border-dashed border-current opacity-40" /></div>;
export const DocLine = ({ k, v, bold }: { k: string; v: ReactNode; bold?: boolean }) => <div className={bold ? "flex justify-between font-bold" : "flex justify-between"}><span>{k}</span><span className="tabular-nums">{v}</span></div>;
export const DocRule = () => <div className="my-2 border-t border-dashed border-current opacity-40" />;

const pdfName = (title: string) => `zakrio-systems-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "document"}-${new Date().toISOString().slice(0, 10)}.pdf`;
const deliverPdf = async (title: string, bytes: Uint8Array) => {
  const blob = new Blob([bytes.buffer as ArrayBuffer], { type: "application/pdf" });
  const result = await shareBlob(blob, pdfName(title), title);
  if (result === "downloaded") toast.info("PDF saved. Attach the file in WhatsApp or another app to share.");
  return result;
};
/** Send the PDF itself through the device share sheet, or save it when file sharing isn't supported. */
export const sharePdfText = (title: string, text: string) => deliverPdf(title, textPdf(title, text));
export const sharePdfTable = (title: string, subtitle: string, head: string[], rows: string[][]) => deliverPdf(title, tablePdf(title, subtitle, head, rows));
