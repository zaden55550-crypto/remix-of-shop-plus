import { useBackupStatus } from "@/lib/cloud-backup";
import { useLanguage } from "@/hooks/use-language";
import { cn } from "@/lib/utils";
export function BackupStatus({ className }: { className?: string }) {
 const s = useBackupStatus(); const { tr } = useLanguage();
 const ago = Date.now() - s.at < 60000 ? tr("now") : `${Math.max(1, Math.floor((Date.now() - s.at) / 60000))} ${tr("min ago")}`;
 const label = s.phase === "backed" ? `✓ ${tr("Backed up")} • ${ago}` : s.phase === "offline" ? tr("Offline • saved locally") : s.phase === "syncing" ? `↻ ${tr("Syncing...")}` : s.phase === "failed" ? tr("Backup pending • saved locally") : s.phase === "account" ? tr("Different backup account • saved locally") : tr("Saved locally • sign in for cloud backup");
 return <p role="status" className={cn("inventory-backup", className)}><span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", s.phase === "backed" ? "bg-success" : "bg-warning")} />{label}</p>;
}
