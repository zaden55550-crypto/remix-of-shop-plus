// Business documents kept on this device (owner, 2026-11-22: "upload as many as I need"). The account only holds each document's
// name, type and size (BusinessDocument in shopbook.ts); the file itself lives in IndexedDB, which holds far more than the
// browser's small key-value storage, so many PDFs and photos fit. Older documents saved with a dataUrl keep working.
const DB = "zakrio-documents", STORE = "files";
export const DOC_MAX_BYTES = 10_000_000;
export const DOC_MAX_COUNT = 30;

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") { reject(new Error("This device can't store documents")); return; }
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("This device can't store documents"));
  });
}
async function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode), req = fn(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(req.result);
      tx.onerror = () => reject(tx.error ?? new Error("Document storage failed"));
      tx.onabort = () => reject(tx.error ?? new Error("Document storage failed"));
    });
  } finally { db.close(); }
}
export const putDocument = (id: string, file: Blob) => run("readwrite", (s) => s.put(file, id)).then(() => undefined);
export const getDocument = (id: string) => run<Blob | undefined>("readonly", (s) => s.get(id) as IDBRequest<Blob | undefined>);
export const deleteDocument = (id: string) => run("readwrite", (s) => s.delete(id)).then(() => undefined);

/** Opens a document (from IndexedDB, or an older inline dataUrl) in a new tab, or downloads it when the browser can't show it. */
export async function openDocument(doc: { id: string; name: string; dataUrl?: string | undefined }) {
  const blob = doc.dataUrl ? await (await fetch(doc.dataUrl)).blob() : (await getDocument(doc.id)) ?? (await restoreDocument(doc));
  if (!blob) throw new Error("This document isn't on this device");
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.target = "_blank"; a.rel = "noopener";
  if (!/^(application\/pdf|image\/)/.test(blob.type)) a.download = doc.name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
export const formatSize = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1000))} KB`);

/* ---------- Online copies (proposed 0022: private bucket, one folder per owner) ---------- */
// Signed in and with 0022 applied, each document is also uploaded to <user id>/<document id>, so another device of the same owner
// can open it. Without either, every call quietly reports false and the document stays on this device as before.
const BUCKET = "business-documents";
async function cloud() {
  const { supabase } = await import("@/integrations/supabase/client");
  const { data } = await supabase.auth.getUser();
  return data.user ? { storage: supabase.storage.from(BUCKET), folder: data.user.id } : null;
}
// Online path: <user id>/<document id>__<file name>, so another device can list the documents with their names.
const safeName = (name: string) => name.replace(/[^\w. -]+/g, "_").slice(0, 120) || "document";
const pathOf = (folder: string, doc: { id: string; name: string }) => `${folder}/${doc.id}__${safeName(doc.name)}`;
/** Uploads one document's online copy. True when the server kept it. */
export async function backupDocument(doc: { id: string; name: string; mime: string; dataUrl?: string | undefined }): Promise<boolean> {
  try {
    const c = await cloud();
    if (!c) return false;
    const body = doc.dataUrl ? await (await fetch(doc.dataUrl)).blob() : await getDocument(doc.id);
    if (!body) return false;
    const { error } = await c.storage.upload(pathOf(c.folder, doc), body, { upsert: true, contentType: doc.mime || body.type });
    return !error;
  } catch { return false; }
}
/** Fetches a document's online copy into this device (for a document added on another device). */
export async function restoreDocument(doc: { id: string; name: string }): Promise<Blob | undefined> {
  try {
    const c = await cloud();
    if (!c) return undefined;
    const { data, error } = await c.storage.download(pathOf(c.folder, doc));
    if (error || !data) return undefined;
    await putDocument(doc.id, data).catch(() => {});
    return data;
  } catch { return undefined; }
}
export async function removeDocumentCopy(doc: { id: string; name: string }) {
  try { const c = await cloud(); if (c) await c.storage.remove([pathOf(c.folder, doc)]); } catch { /* the online copy stays until removed again */ }
}
/** The documents kept online for this owner (empty when signed out or before 0022). */
export async function listCloudDocuments(): Promise<{ id: string; name: string; mime: string; size: number; cloud: true }[]> {
  try {
    const c = await cloud();
    if (!c) return [];
    const { data, error } = await c.storage.list(c.folder, { limit: 100 });
    if (error || !data) return [];
    return data.flatMap((o) => {
      const at = o.name.indexOf("__");
      if (at < 1) return [];
      const meta = (o.metadata ?? {}) as { size?: number; mimetype?: string };
      return [{ id: o.name.slice(0, at), name: o.name.slice(at + 2), mime: meta.mimetype ?? "application/octet-stream", size: meta.size ?? 0, cloud: true as const }];
    });
  } catch { return []; }
}
