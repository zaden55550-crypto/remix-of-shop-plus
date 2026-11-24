// Settings › Login Security: the signed-in person's passkeys (fingerprint, face or screen lock instead of a password).
// A passkey belongs to the online account, so this needs an online session; a device-only login is told how to get one.
import { useCallback, useEffect, useState } from "react";
import { Fingerprint, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { ShopButton } from "@/components/ui/shop-button";
import { useLanguage } from "@/hooks/use-language";
import { addPasskey, passkeysEnabled, currentIdentity, listPasskeys, passkeyCancelled, passkeyMessage, passkeysSupported, removePasskey, type Passkey } from "@/lib/auth-service";
import { markDevicePasskey } from "@/components/shopbook/ui";

type View = { kind: "loading" } | { kind: "off" } | { kind: "unsupported" } | { kind: "signed-out" } | { kind: "error"; message: string } | { kind: "ready"; keys: Passkey[] };

export function PasskeysPanel() {
  const { tr } = useLanguage();
  const [view, setView] = useState<View>({ kind: "loading" });
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!(await passkeysEnabled())) { setView({ kind: "off" }); return; }
    if (!passkeysSupported()) { setView({ kind: "unsupported" }); return; }
    if (!(await currentIdentity().catch(() => null))) { setView({ kind: "signed-out" }); return; }
    try { const keys = await listPasskeys(); markDevicePasskey(keys.length > 0); setView({ kind: "ready", keys }); }
    catch (e) { setView({ kind: "error", message: passkeyMessage(e) }); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const add = async () => {
    setBusy(true);
    try { await addPasskey(); toast.success(tr("Passkey added. Next time, tap Passkey on the login page.")); await load(); }
    catch (e) { if (!passkeyCancelled(e)) toast.error(tr(passkeyMessage(e))); }
    finally { setBusy(false); }
  };
  const remove = async (key: Passkey) => {
    if (!window.confirm(tr("Remove this passkey? You can still log in with your email and password."))) return;
    setBusy(true);
    try { await removePasskey(key.id); toast.success(tr("Passkey removed")); await load(); }
    catch (e) { toast.error(tr(passkeyMessage(e))); }
    finally { setBusy(false); }
  };

  const date = (iso?: string) => (iso ? new Date(iso).toLocaleDateString() : "—");
  return <div className="passkeys-panel">
    <p className="settings-note">{tr("A passkey lets you log in with your fingerprint, face or screen lock instead of typing a password. It stays on your phone or computer and can't be stolen like a password.")}</p>
    {view.kind === "loading" && <p className="settings-note">{tr("Loading…")}</p>}
    {view.kind === "off" && <p className="settings-note">{tr("Passkey sign-in is coming soon. For now, log in with your email, Google or Apple.")}</p>}
    {view.kind === "unsupported" && <p className="settings-note">{tr("This browser doesn't support passkeys. Try an up-to-date Chrome, Safari or Edge.")}</p>}
    {view.kind === "signed-out" && <p className="settings-note">{tr("To add a passkey, log out and log in again with internet, using your email, Google or Apple.")}</p>}
    {view.kind === "error" && <p className="settings-note" role="alert">{tr(view.message)}</p>}
    {view.kind === "ready" && <>
      {view.keys.length === 0
        ? <p className="settings-note">{tr("No passkeys yet.")}</p>
        : <ul className="passkeys-list">{view.keys.map((k) => <li key={k.id} className="settings-inline">
            <span><Fingerprint className="inline h-4 w-4" aria-hidden /> <b>{k.name}</b> <small>{tr("Added {x}", date(k.createdAt))}{k.lastUsedAt ? ` · ${tr("Last used {x}", date(k.lastUsedAt))}` : ""}</small></span>
            <ShopButton variant="outline" className="h-8 px-2" disabled={busy} aria-label={tr("Remove passkey")} onClick={() => void remove(k)}><Trash2 className="h-4 w-4" /></ShopButton>
          </li>)}</ul>}
      <ShopButton className="inventory-save" disabled={busy} onClick={() => void add()}><Fingerprint className="h-4 w-4" /> {tr("Add a passkey on this phone or computer")}</ShopButton>
    </>}
  </div>;
}
