import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { ShopButton } from "@/components/ui/shop-button";
import { BackupStatus } from "@/components/shopbook/backup-status";
import { backupJson, restoreJson, validateBackup } from "@/lib/backup";
import { load } from "@/lib/erp";
import { getSnapshot, listSnapshots, markRestoreTested } from "@/lib/snapshot.functions";
import { backUpNow, EVENT, getPrefs, lastFailure, lastVerified, setPrefs } from "@/lib/snapshots";
import { createLocalBackup, decryptBackup, encryptBackup, listLocalBackups, readLocalBackup } from "@/lib/local-backups";

type Row = Awaited<ReturnType<typeof listSnapshots>>[number];
type Preview = { id?: string; localId?: string; text: string; shop: string; at: number; rows: [string, number, number][] };
const when = (t: number) => (t ? new Date(t).toLocaleString() : "—");
const kb = (n: number) => (n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
const COUNTED = ["products", "customers", "suppliers", "sales", "purchases", "expenses", "payments", "movements", "employees", "payrolls"];
const lastLocalBackup = () => typeof localStorage === "undefined" ? 0 : Number(localStorage.getItem("shopbook.lastLocalBackup") || 0);

export function BackupHub({ tr, shopName }: { tr: (x: string) => string; shopName: string }) {
  const nav = useNavigate();
  const [signed, setSigned] = useState(false), [rows, setRows] = useState<Row[]>([]), [localRows, setLocalRows] = useState<Awaited<ReturnType<typeof listLocalBackups>>>([]), [busy, setBusy] = useState(""), [prefs, setP] = useState(getPrefs()), [, tick] = useState(0), [preview, setPreview] = useState<Preview | null>(null), [exportOpen, setExportOpen] = useState(false), [exportPassword, setExportPassword] = useState(""), [confirmPassword, setConfirmPassword] = useState(""), file = useRef<HTMLInputElement>(null);
  const refresh = useCallback(() => listSnapshots().then(setRows).catch(() => undefined), []);
  const refreshLocal = useCallback(() => listLocalBackups().then(setLocalRows).catch((e) => toast.error(e instanceof Error ? e.message : tr("Local backup unavailable"))), [tr]);
  useEffect(() => { const f = () => supabase.auth.getSession().then(({ data }) => setSigned(!!data.session)); f(); const a = supabase.auth.onAuthStateChange(f); const e = () => { tick((n) => n + 1); refresh(); }; const l = () => { tick((n) => n + 1); refreshLocal(); }; window.addEventListener(EVENT, e); window.addEventListener("shopbook-local-backups", l); void refreshLocal(); return () => { a.data.subscription.unsubscribe(); window.removeEventListener(EVENT, e); window.removeEventListener("shopbook-local-backups", l); }; }, [refresh, refreshLocal]);
  useEffect(() => { if (signed) refresh(); }, [signed, refresh]);
  const fail = lastFailure().split("|");

  const now = async () => { setBusy("backup"); try { await createLocalBackup(shopName, "manual", prefs.keep); await refreshLocal(); } catch (e) { await refreshLocal(); toast.error(e instanceof Error ? e.message : tr("Local backup failed")); setBusy(""); return; }
    if (signed) { try { await backUpNow("manual"); toast.success(tr("Local and cloud backups completed.")); } catch (e) { toast.error(`${tr("Local backup completed; cloud backup failed")}: ${e instanceof Error ? e.message : tr("Backup failed")}`); } }
    else toast.success(tr("Local backup completed.")); setBusy(""); };
  const download = async () => { if (exportPassword !== confirmPassword) { toast.error(tr("Backup passphrases do not match")); return; } try { const encrypted = await encryptBackup(backupJson(shopName), exportPassword); const u = URL.createObjectURL(new Blob([encrypted], { type: "application/json" })); const a = document.createElement("a"); a.href = u; a.download = `zakrio-systems-encrypted-backup-${new Date().toISOString().slice(0, 10)}.spbackup`; a.click(); URL.revokeObjectURL(u); setExportOpen(false); setExportPassword(""); setConfirmPassword(""); toast.success(tr("Encrypted backup downloaded. Keep its passphrase somewhere safe.")); } catch (e) { toast.error(e instanceof Error ? e.message : tr("Backup export failed")); } };
  const open = (text: string, id?: string) => {
    const f = JSON.parse(text); validateBackup(f); const cur = load() as unknown as Record<string, unknown[]>; const d = f.data as unknown as Record<string, unknown[]>;
    setPreview({ text, ...(id ? { id } : {}), shop: f.shop, at: f.at, rows: COUNTED.map((k) => [k, (cur[k] ?? []).length, (d[k] ?? []).length]) });
  };
  const pick = async (id: string) => { setBusy(id); try { open(await getSnapshot({ data: { id } }), id); } catch (e) { toast.error(e instanceof Error ? e.message : "Backup unavailable"); } finally { setBusy(""); } };
  const pickLocal = async (id: string) => { setBusy(id); try { const b = await readLocalBackup(id); const f = JSON.parse(b.text); const cur = load() as unknown as Record<string, unknown[]>; const d = f.data as unknown as Record<string, unknown[]>; setPreview({ localId: id, text: b.text, shop: f.shop, at: f.at, rows: COUNTED.map((k) => [k, (cur[k] ?? []).length, (d[k] ?? []).length]) }); } catch (e) { toast.error(e instanceof Error ? e.message : tr("Backup unavailable")); } finally { setBusy(""); } };
  const restore = async () => {
    if (!preview) return; setBusy("restore");
    try {
      await createLocalBackup(shopName, "pre-restore", prefs.keep);
      if (signed) { try { await backUpNow("pre-restore"); } catch (e) { toast.error(`${tr("Local safety copy saved; cloud safety copy failed")}: ${e instanceof Error ? e.message : tr("Backup failed")}`); } }
      restoreJson(preview.text);
      const after = load() as unknown as Record<string, unknown[]>; const bad = preview.rows.filter(([k, , n]) => (after[k] ?? []).length !== n);
      if (bad.length) throw new Error(`${tr("Restore check failed for")}: ${bad.map((b) => b[0]).join(", ")}`);
      if (preview.id) await markRestoreTested({ data: { id: preview.id } });
      toast.success(tr("Backup restored and checked. A safety copy of your previous data was saved first.")); setPreview(null); refresh(); await refreshLocal();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Restore failed"); } finally { setBusy(""); }
  };
  const other = preview && preview.shop.trim().toLowerCase() !== shopName.trim().toLowerCase();

  const localNext = () => prefs.auto ? (lastLocalBackup() ? lastLocalBackup() + prefs.hours * 3_600_000 : Date.now()) : 0;
  const localFail = typeof localStorage === "undefined" ? "" : localStorage.getItem("shopbook.localBackupFailure") || "";
  const restoreFile = async (f: File) => {
    const text = await f.text();
    let encrypted = false;
    try { encrypted = JSON.parse(text)?.app === "SHOPPLUS-ENCRYPTED"; } catch { /* open() reports invalid backup files */ }
    const clear = encrypted ? await decryptBackup(text, window.prompt(tr("Enter the backup passphrase")) ?? "") : text;
    open(clear);
  };

  return <div className="import-center">
    <BackupStatus className="px-0" />
    <p className="settings-note">{tr("Automatic backups are saved in this browser on this device. They do not protect against losing the device. Download an encrypted backup and keep it somewhere separate for that.")}</p>
    {!signed && <><p className="settings-note">{tr("Cloud backup is optional and needs a connected account. Email, Apple or Google sign-in can be connected under People & Access.")}</p><ShopButton className="inventory-save" onClick={() => nav({ to: "/settings", search: { menu: "People & Access" } })}>{tr("Connect optional cloud backup")}</ShopButton></>}
    <div className="settings-inline"><span>{tr("Last verified backup")}</span><b>{when(lastVerified())}</b></div>
    <div className="settings-inline"><span>{tr("Next automatic local backup")}</span><b>{prefs.auto ? when(localNext()) : tr("Off")}</b></div>
    <div className="settings-inline"><span>{tr("Last local backup")}</span><b>{when(lastLocalBackup())}</b></div>
    {fail[1] && <p className="text-destructive text-xs">{tr("Last backup failed")} ({when(Date.parse(fail[0] ?? ""))}): {fail[1]}. {tr("Check your connection and tap Back Up Now.")}</p>}
    {localFail && <p className="text-destructive text-xs">{tr("Last local backup failed")} ({when(Date.parse(localFail.split("|")[0] ?? ""))}): {localFail.split("|").slice(1).join("|")}</p>}
    <ShopButton className="inventory-save" disabled={!!busy} onClick={now}>{busy === "backup" ? tr("Backing up and verifying...") : tr("Back Up Now")}</ShopButton>
    <ShopButton variant="outline" className="inventory-save" onClick={() => setExportOpen((v) => !v)}>{tr("Download Encrypted Backup")}</ShopButton>
    {exportOpen && <div className="pm-form"><label className="inventory-field"><span>{tr("Backup passphrase · at least 12 characters")}</span><input className="inventory-input" type="password" autoComplete="new-password" value={exportPassword} onChange={(e) => setExportPassword(e.target.value)} /></label><label className="inventory-field"><span>{tr("Confirm backup passphrase")}</span><input className="inventory-input" type="password" autoComplete="new-password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} /></label><ShopButton className="inventory-save" disabled={exportPassword.length < 12 || !confirmPassword} onClick={() => void download()}>{tr("Encrypt and Download")}</ShopButton></div>}
    <p className="money-heading">{tr("Automatic Backups")}</p>
    <label className="settings-toggle"><span>{tr("Automatic backups")}</span><input type="checkbox" checked={prefs.auto} onChange={(e) => { const p = { ...prefs, auto: e.target.checked }; setP(p); setPrefs(p); }} /></label>
    <label className="settings-inline"><span>{tr("How often")}</span><select value={prefs.hours} onChange={(e) => { const p = { ...prefs, hours: Number(e.target.value) }; setP(p); setPrefs(p); }}><option value={6}>{tr("Every 6 hours")}</option><option value={12}>{tr("Every 12 hours")}</option><option value={24}>{tr("Daily")}</option><option value={168}>{tr("Weekly")}</option></select></label>
    <label className="settings-inline"><span>{tr("Keep last")}</span><select value={prefs.keep} onChange={(e) => { const p = { ...prefs, keep: Number(e.target.value) }; setP(p); setPrefs(p); }}>{[7, 14, 30, 60].map((n) => <option key={n} value={n}>{n} {tr("backups")}</option>)}</select></label>
    <p className="settings-note">{tr("Automatic backups run while the app is open on this device. Older copies are removed only after a new one is verified.")}</p>
    <p className="money-heading">{tr("Backup History")}</p>
    {localRows.map((r) => <div className="settings-audit" key={`local:${r.id}`}><b>{when(r.createdAt)} • {tr("Local")} · {tr(r.kind)}</b><span>{r.shop} • {r.size > 1_048_576 ? `${(r.size / 1_048_576).toFixed(1)} MB` : `${Math.max(1, Math.round(r.size / 1024))} KB`} • {tr("checksum")} {r.checksum.slice(0, 8)}</span><small>✓ {tr("Verified locally")}</small><ShopButton variant="outline" className="settings-mini" disabled={!!busy} onClick={() => void pickLocal(r.id)}>{tr("Restore")}</ShopButton></div>)}
    {signed && !rows.length && <p className="settings-note">{tr("No cloud backups yet")}</p>}
    {rows.map((r) => <div className="settings-audit" key={r.id}>
      <b>{when(Date.parse(r.created_at))} • {tr(r.kind)}</b>
      <span>{r.shop_name} • {r.record_count} {tr("records")} • {kb(r.size_bytes)} • {tr("checksum")} {r.checksum.slice(0, 8)}</span>
      <small>{r.verified_at ? `✓ ${tr("Verified")}` : `✗ ${tr("Not verified")}`}{r.restore_tested_at ? ` • ✓ ${tr("Restore tested")} ${when(Date.parse(r.restore_tested_at))}` : ` • ${tr("Restore not tested")}`}</small>
      {r.verified_at && <ShopButton variant="outline" className="settings-mini" disabled={!!busy} onClick={() => pick(r.id)}>{busy === r.id ? "..." : tr("Restore")}</ShopButton>}
    </div>)}
    <input ref={file} hidden type="file" accept=".json,.spbackup,application/json" onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ""; if (!f) return; try { await restoreFile(f); } catch (x) { toast.error(x instanceof Error ? x.message : "Not a Zakrio Systems backup file"); } }} />
    <ShopButton variant="outline" className="inventory-save" onClick={() => file.current?.click()}>{tr("Restore from file")}</ShopButton>
    {preview && <div className="import-center">
      <p className="money-heading">{tr("Restore preview")}</p>
      <p className="settings-note">{preview.shop} • {when(preview.at)}</p>
      {preview.rows.map(([k, cur, next]) => <div className="settings-inline" key={k}><span>{tr(k)}</span><b>{cur} → {next}</b></div>)}
      {other ? <p className="text-destructive text-xs">{tr("This backup belongs to another shop and cannot be restored here.")}</p>
        : <p className="settings-note">{tr("Everything on this device will be replaced by the backup. Records made after the backup will be lost. A safety copy of your current data is made first.")}</p>}
      <ShopButton className="inventory-save bg-destructive text-destructive-foreground" disabled={!!other || !!busy} onClick={restore}>{busy === "restore" ? tr("Restoring...") : tr("Yes, restore this backup")}</ShopButton>
      <ShopButton variant="outline" className="inventory-save" disabled={busy === "restore"} onClick={() => setPreview(null)}>{tr("Cancel")}</ShopButton>
    </div>}
  </div>;
}
