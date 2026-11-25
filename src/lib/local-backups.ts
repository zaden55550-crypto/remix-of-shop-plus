import { backupJson, validateBackup } from "@/lib/backup";

const DB_NAME = "shopplus-local-backups";
const STORE = "snapshots";
const base64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const bytes = (value: string) => Uint8Array.from(atob(value), (c) => c.charCodeAt(0));

export type LocalBackup = { id: string; shop: string; createdAt: number; kind: "automatic" | "manual" | "pre-restore"; checksum: string; size: number; text: string };
export type EncryptedBackup = { app: "SHOPPLUS-ENCRYPTED"; version: 1; kdf: "PBKDF2-SHA-256"; iterations: number; salt: string; iv: string; ciphertext: string };

function database(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") return Promise.reject(new Error("Local backup storage is unavailable in this browser"));
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: "id" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Could not open local backup storage"));
  });
}

async function digest(text: string) {
  const result = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(result)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function request<T>(db: IDBDatabase, mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(STORE, mode), result = work(tx.objectStore(STORE));
    result.onsuccess = () => resolve(result.result);
    result.onerror = () => reject(result.error ?? new Error("Local backup storage failed"));
    tx.onabort = () => reject(tx.error ?? new Error("Local backup storage failed"));
  });
}

export async function listLocalBackups(): Promise<Omit<LocalBackup, "text">[]> {
  const db = await database();
  try { return ((await request<LocalBackup[]>(db, "readonly", (s) => s.getAll())) ?? []).map(({ text: _text, ...r }) => r).sort((a, b) => b.createdAt - a.createdAt); }
  finally { db.close(); }
}

export async function readLocalBackup(id: string): Promise<LocalBackup> {
  const db = await database();
  try {
    const row = await request<LocalBackup | undefined>(db, "readonly", (s) => s.get(id));
    if (!row || await digest(row.text) !== row.checksum) throw new Error("This local backup is missing or failed its integrity check");
    validateBackup(JSON.parse(row.text));
    return row;
  } finally { db.close(); }
}

export async function createLocalBackup(shop: string, kind: LocalBackup["kind"] = "automatic", keep = 14) {
  const text = backupJson(shop), parsed = JSON.parse(text);
  validateBackup(parsed);
  const row: LocalBackup = { id: crypto.randomUUID(), shop, createdAt: Date.now(), kind, checksum: await digest(text), size: new Blob([text]).size, text };
  const db = await database();
  try {
    await request(db, "readwrite", (s) => s.put(row));
    const all = ((await request<LocalBackup[]>(db, "readonly", (s) => s.getAll())) ?? []).sort((a, b) => b.createdAt - a.createdAt);
    const remove = all.slice(Math.max(1, Math.min(100, Math.floor(keep))));
    if (remove.length) await new Promise<void>((resolve, reject) => { const tx = db.transaction(STORE, "readwrite"); for (const r of remove) tx.objectStore(STORE).delete(r.id); tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error); });
  } finally { db.close(); }
  return { id: row.id, createdAt: row.createdAt, checksum: row.checksum, size: row.size };
}

/** Browser-local scheduled copies work without a cloud identity. They only protect this browser profile/device. */
export function startAutoLocalBackups() {
  let busy = false;
  const tick = async () => {
    if (busy || typeof document === "undefined" || document.visibilityState !== "visible" || localStorage.getItem("shopbook.session") !== "1") return;
    const account = JSON.parse(localStorage.getItem("shopbook.account") || "null") as { shopName?: string; staff?: boolean } | null;
    if (!account?.shopName || account.staff) return;
    const prefs = { auto: true, hours: 24, keep: 14, ...JSON.parse(localStorage.getItem("shopbook.snapshotPrefs") || "{}") };
    const last = Number(localStorage.getItem("shopbook.lastLocalBackup") || 0);
    if (!prefs.auto || (last > 0 && Date.now() < last + Math.max(1, Number(prefs.hours) || 24) * 3_600_000)) return;
    busy = true;
    try {
      const result = await createLocalBackup(account.shopName, "automatic", prefs.keep);
      localStorage.setItem("shopbook.lastLocalBackup", String(result.createdAt));
      localStorage.removeItem("shopbook.localBackupFailure");
      window.dispatchEvent(new Event("shopbook-local-backups"));
    } catch (e) {
      localStorage.setItem("shopbook.localBackupFailure", `${new Date().toISOString()}|${e instanceof Error ? e.message : "Local backup failed"}`);
      window.dispatchEvent(new Event("shopbook-local-backups"));
    } finally { busy = false; }
  };
  const timer = setInterval(() => { void tick(); }, 60_000);
  const run = () => { void tick(); };
  window.addEventListener("shopbook-session", run); window.addEventListener("shopbook-erp", run); window.addEventListener("shopbook-prefs", run);
  const first = setTimeout(run, 10_000);
  return () => { clearInterval(timer); clearTimeout(first); window.removeEventListener("shopbook-session", run); window.removeEventListener("shopbook-erp", run); window.removeEventListener("shopbook-prefs", run); };
}

async function passwordKey(password: string, salt: Uint8Array, usages: KeyUsage[]) {
  if (password.length < 12) throw new Error("Use a backup passphrase at least 12 characters long");
  const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "PBKDF2", hash: "SHA-256", salt: new Uint8Array(salt).buffer, iterations: 310_000 }, material, { name: "AES-GCM", length: 256 }, false, usages);
}

export async function encryptBackup(text: string, password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await passwordKey(password, salt, ["encrypt"]);
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(text));
  return JSON.stringify({ app: "SHOPPLUS-ENCRYPTED", version: 1, kdf: "PBKDF2-SHA-256", iterations: 310_000, salt: base64(salt), iv: base64(iv), ciphertext: base64(new Uint8Array(encrypted)) } satisfies EncryptedBackup);
}

export async function decryptBackup(text: string, password: string): Promise<string> {
  let value: unknown;
  try { value = JSON.parse(text); } catch { throw new Error("This is not a DataQuill Solutions backup file"); }
  if (!value || typeof value !== "object" || (value as Partial<EncryptedBackup>).app !== "SHOPPLUS-ENCRYPTED") return text;
  const file = value as Partial<EncryptedBackup>;
  if (file.version !== 1 || file.kdf !== "PBKDF2-SHA-256" || file.iterations !== 310_000 || typeof file.salt !== "string" || typeof file.iv !== "string" || typeof file.ciphertext !== "string") throw new Error("This encrypted backup version is not supported");
  try {
    const salt = bytes(file.salt), iv = bytes(file.iv), ciphertext = bytes(file.ciphertext), key = await passwordKey(password, salt, ["decrypt"]);
    const clear = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
    const result = new TextDecoder().decode(clear);
    validateBackup(JSON.parse(result));
    return result;
  } catch (e) {
    if (e instanceof Error && e.message.includes("passphrase")) throw e;
    throw new Error("The backup passphrase is incorrect or the file is damaged");
  }
}
