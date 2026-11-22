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
  const blob = doc.dataUrl ? await (await fetch(doc.dataUrl)).blob() : await getDocument(doc.id);
  if (!blob) throw new Error("This document isn't on this device");
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.target = "_blank"; a.rel = "noopener";
  if (!/^(application\/pdf|image\/)/.test(blob.type)) a.download = doc.name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
export const formatSize = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1000))} KB`);
