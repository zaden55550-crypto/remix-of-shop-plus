// Fresh start (owner, 2026-11-23): every device that opens this version for the first time forgets everything DataQuill Solutions kept on
// it before (businesses, records, accounts, settings, sign-in sessions, saved documents and local backups), once, so the whole
// system starts brand new. The server side is emptied separately (drizzle/proposed/WIPE-2026-11-23-fresh-start.sql).
// Imported first in __root. A device that already started on this epoch is never wiped again; to start everyone fresh again in
// future, change DATA_EPOCH (only with the owner's approval: it deletes every device's data).
export const DATA_EPOCH = "2026-11-23-fresh-start";
const EPOCH_KEY = "zakrio.dataEpoch";
const OWN_PREFIXES = ["shopbook", "zakrio", "shopplus", "sb-"];
const DATABASES = ["zakrio-documents", "shopplus-local-backups"];

/** Clears this device's DataQuill Solutions data once per epoch. Returns true when something was removed. */
export function freshStart(storage: Storage = window.localStorage): boolean {
  let removed = false;
  try {
    if (storage.getItem(EPOCH_KEY) === DATA_EPOCH) return false;
    for (const key of Object.keys(storage)) if (key !== EPOCH_KEY && OWN_PREFIXES.some((p) => key.startsWith(p))) { storage.removeItem(key); removed = true; }
    try { if (window.sessionStorage.length) { window.sessionStorage.clear(); removed = true; } } catch { /* no session storage */ }
    try { for (const db of DATABASES) window.indexedDB?.deleteDatabase(db); } catch { /* no IndexedDB */ }
    storage.setItem(EPOCH_KEY, DATA_EPOCH);
  } catch { /* storage blocked: nothing kept on this device anyway */ }
  return removed;
}

if (typeof window !== "undefined" && import.meta.env?.MODE !== "test") {
  // Reload once after a wipe so nothing already read into memory survives.
  if (freshStart()) window.location.reload();
}
