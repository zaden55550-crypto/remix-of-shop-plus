import { useState } from "react";
import { Wifi, WifiOff, RefreshCw, X } from "lucide-react";
import { ShopButton } from "@/components/ui/shop-button";
import { useLanguage } from "@/hooks/use-language";
import { useSyncStatus } from "@/lib/shop-sync";
import { useBackupStatus } from "@/lib/cloud-backup";
import { connectionLabel, useConnectivity, type VisibleConnection } from "@/lib/connectivity";
import { cn } from "@/lib/utils";
export type Conn = VisibleConnection;
export function useConnection() {
  const s = useConnectivity();
  return { conn: connectionLabel(s, false), lastOk: s.lastOk, retry: s.retry };
}
const labels = { online: "Online", connecting: "Connecting", offline: "Offline", syncing: "Syncing" };
export function ConnectionStatus({ className }: { className?: string }) {
  const { tr } = useLanguage(), connection = useConnectivity(), sync = useSyncStatus(), backup = useBackupStatus();
  const [open, setOpen] = useState(false);
  const conn = connectionLabel(connection, sync.phase === "syncing");
  const pending = sync.pending ?? 0;
  const Icon = conn === "offline" ? WifiOff : conn === "connecting" || conn === "syncing" ? RefreshCw : Wifi;
  const color = conn === "online" ? "text-success" : conn === "offline" ? "text-destructive" : "text-warning";
  const message = sync.phase === "local" ? tr("Sign-in required to resume synchronization")
    : pending ? `${pending} ${tr("changes waiting to sync")}`
    : sync.phase === "live" && sync.at ? tr("All changes synchronized") : tr("Changes are saved on this device");
  return <div className={cn("relative flex min-w-0 items-center", className)}>
    <ShopButton variant="bare" aria-label={tr("Connection status")} aria-expanded={open} onClick={() => setOpen((v) => !v)}
      className={cn("h-7 w-auto gap-1 rounded-full border border-border bg-card px-2 text-[10px] font-semibold", color)}>
      <Icon className={cn("h-3.5 w-3.5", (conn === "connecting" || conn === "syncing") && "motion-safe:animate-spin")} />
      <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", conn === "online" ? "bg-success" : conn === "offline" ? "bg-destructive" : "bg-warning")} />
      <span className="hidden min-[400px]:inline" role="status">{tr(labels[conn])}</span>
    </ShopButton>
    {open && <div role="dialog" aria-label={tr("Connection details")} className="absolute left-0 top-9 z-40 w-64 max-w-[calc(100vw-5rem)] rounded-lg border border-border bg-popover p-3 text-start text-xs shadow-lg">
      <div className="flex items-center justify-between"><b className={color}>{tr(labels[conn])}</b><ShopButton variant="bare" className="h-6 w-6 p-0" aria-label={tr("Close")} onClick={() => setOpen(false)}><X className="h-3 w-3" /></ShopButton></div>
      <p className="mt-2 font-semibold">{message}</p>
      <p className="mt-2 text-muted-foreground">{tr("Internet")}: {tr(connection.internet ? "Available" : "Unavailable")}</p>
      <p className="text-muted-foreground">{tr("Backend")}: {tr(connection.backend === "up" ? "Available" : connection.backend === "down" ? "Unavailable" : "Checking")}</p>
      <p className="text-muted-foreground">{tr("Pending changes")}: {pending}</p>
      <p className="text-muted-foreground">{tr("Last server check")}: {connection.lastOk ? new Date(connection.lastOk).toLocaleTimeString() : "—"}</p>
      <p className="text-muted-foreground">{tr("Last sync")}: {sync.at ? new Date(sync.at).toLocaleTimeString() : "—"}</p>
      <p className="mt-1 text-muted-foreground">{tr("M-Pesa and bank entries are recorded, not externally verified.")}</p>
      {sync.error && <p role="alert" className="mt-2 break-words text-destructive">{sync.error.includes("SYNC_CONFLICT") ? tr("A record changed on another device. Changes remain saved here; review with support before retrying.") : sync.error}</p>}
      {backup.phase === "failed" && <p className="mt-1 text-warning">{tr("Cloud backup needs attention")}</p>}
      <ShopButton className="mt-3 h-8 text-xs" onClick={() => { void connection.retry(); }}>{tr("Retry now")}</ShopButton>
    </div>}
  </div>;
}
