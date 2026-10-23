import { useSyncStatus } from "@/lib/shop-sync";
import { useConnectivity } from "@/lib/connectivity";
import { useLanguage } from "@/hooks/use-language";
import { cn } from "@/lib/utils";
/** Sync runs silently in the background; a line only appears when offline or sync is stuck, showing the last synced time. */
export function BackupStatus({ className }: { className?: string }) {
  const sync = useSyncStatus(), conn = useConnectivity(); const { tr } = useLanguage();
  const trouble = !conn.internet || conn.backend === "down" || sync.phase === "offline" || sync.phase === "failed";
  if (!trouble) return null;
  const when = sync.at ? new Date(sync.at).toLocaleString([], { hour: "2-digit", minute: "2-digit", day: "numeric", month: "short" }) : "—";
  return <p role="status" className={cn("inventory-backup", className)}><span className="h-1.5 w-1.5 shrink-0 rounded-full bg-warning" />{tr("Synced")} {when}</p>;
}
