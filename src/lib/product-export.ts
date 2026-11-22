// Builds the All Products export from real records. Read-only: nothing here changes the shop's data.
import { downloadBlob } from "@/lib/download";
import { tablePdf } from "@/lib/simple-pdf";
import * as erp from "@/lib/erp";

export type ExportFormat = "xlsx" | "csv" | "pdf";
type Cell = string | number;
type Column = { key: string; label: string; value: (p: erp.Product, s: erp.ErpState) => Cell };

export const statusLabel = (p: erp.Product) => (p.archived ? "Archived" : { OK: "In Stock", LOW: "Low Stock", OUT: "Out of Stock" }[erp.stockStatus(p)]);

export const EXPORT_COLUMNS: Column[] = [
  { key: "name", label: "Product Name", value: (p) => p.name },
  { key: "category", label: "Category", value: (p, s) => s.categories.find((c) => c.id === p.categoryId)?.name ?? "" },
  { key: "brand", label: "Brand", value: (p, s) => s.brands.find((b) => b.id === p.brandId)?.name ?? "" },
  { key: "sku", label: "SKU", value: (p) => p.sku ?? "" },
  { key: "barcode", label: "Barcode", value: (p) => p.barcode ?? "" },
  { key: "unit", label: "Unit", value: (p) => p.unit || "pcs" },
  { key: "pieces", label: "Pieces", value: (p) => p.pieces ?? 1 },
  { key: "qty", label: "Current Stock", value: (p) => p.qty },
  { key: "buy", label: "Buying Price", value: (p) => p.buy },
  { key: "sell", label: "Selling Price", value: (p) => p.sell },
  { key: "wholesale", label: "Wholesale price", value: (p) => p.wholesale?.price ?? "" },
  { key: "wholesaleFrom", label: "Wholesale from (qty)", value: (p) => p.wholesale?.from ?? "" },
  { key: "status", label: "Stock Status", value: (p) => statusLabel(p) },
];

export function exportTable(s: erp.ErpState, products: erp.Product[], keys: string[]) {
  const columns = EXPORT_COLUMNS.filter((c) => keys.includes(c.key));
  return { head: columns.map((c) => c.label), rows: products.map((p) => columns.map((c) => c.value(p, s))) };
}

/** Quotes every cell and stops spreadsheets running text that starts like a formula. */
export function csvText(head: string[], rows: Cell[][]) {
  const cell = (v: Cell) => {
    if (typeof v === "number") return String(v);
    const safe = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
    return `"${safe.replaceAll('"', '""')}"`;
  };
  return [head, ...rows].map((r) => r.map(cell).join(",")).join("\n");
}

type Xlsx = typeof import("xlsx");
export function xlsxBytes(XLSX: Xlsx, head: string[], rows: Cell[][]) {
  const sheet = XLSX.utils.aoa_to_sheet([head, ...rows]);
  sheet["!cols"] = head.map((h, i) => ({ wch: Math.min(40, Math.max(h.length, ...rows.map((r) => String(r[i] ?? "").length)) + 2) }));
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, "Products");
  return XLSX.write(book, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
}

/** Saves the file on the device. `XLSX` is loaded before the click, because phones only allow a download during a tap. */
export function saveExport(format: ExportFormat, s: erp.ErpState, products: erp.Product[], keys: string[], shop: string, XLSX?: Xlsx) {
  const { head, rows } = exportTable(s, products, keys);
  const day = new Date().toISOString().slice(0, 10);
  const name = `zakrio-systems-products-${day}.${format}`;
  if (format === "csv") return downloadBlob(new Blob([`﻿${csvText(head, rows)}`], { type: "text/csv;charset=utf-8" }), name);
  if (format === "pdf") {
    const pdf = tablePdf(`${shop || "ZAKRIO SYSTEMS"} - Products`, `${products.length} products - ${day}`, head, rows.map((r) => r.map(String)));
    return downloadBlob(new Blob([pdf.buffer as ArrayBuffer], { type: "application/pdf" }), name);
  }
  if (!XLSX) throw new Error("Excel export is still loading");
  downloadBlob(new Blob([xlsxBytes(XLSX, head, rows)], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), name);
}

/** Shrinks a chosen picture so one product image never fills the device's storage. */
export function readProductImage(file: File, size = 480): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith("image/")) { reject(new Error("Choose an image file")); return; }
    const url = URL.createObjectURL(file), img = new Image();
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("That image could not be read")); };
    img.onload = () => {
      const scale = Math.min(1, size / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale); canvas.height = Math.round(img.height * scale);
      canvas.getContext("2d")?.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/jpeg", 0.82));
    };
    img.src = url;
  });
}
