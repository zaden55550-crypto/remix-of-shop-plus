// A small real PDF writer for tables (A4 landscape, built-in Helvetica), so exports need no new dependency.
// Text outside Latin-1 cannot be drawn by the built-in font and shows as "?".

const PAGE_W = 842, PAGE_H = 595, MARGIN = 28, ROW_H = 16, FONT = 8;

const latin = (text: string) => [...text].map((c) => (c.charCodeAt(0) < 256 ? c : "?")).join("");
const esc = (text: string) => latin(text).replace(/[\\()]/g, (m) => `\\${m}`).replace(/[\r\n\t]+/g, " ");
/** Helvetica averages about half the font size per character. */
const fit = (text: string, width: number, size: number) => {
  const max = Math.max(1, Math.floor(width / (size * 0.52)));
  return text.length > max ? `${text.slice(0, Math.max(1, max - 1))}...` : text;
};

export function tablePdf(title: string, subtitle: string, head: string[], rows: string[][]): Uint8Array {
  const widest = head.map((h, i) => Math.min(30, Math.max(h.length, ...rows.map((r) => (r[i] ?? "").length), 4)));
  const total = widest.reduce((a, b) => a + b, 0) || 1;
  const usable = PAGE_W - MARGIN * 2;
  const widths = widest.map((w) => (w / total) * usable);
  const perPage = Math.max(1, Math.floor((PAGE_H - MARGIN * 2 - 62) / ROW_H));
  const pages: string[][][] = [];
  for (let i = 0; i < rows.length; i += perPage) pages.push(rows.slice(i, i + perPage));
  if (!pages.length) pages.push([]);

  const text = (x: number, y: number, font: string, size: number, value: string) => `BT /${font} ${size} Tf ${x.toFixed(1)} ${y.toFixed(1)} Td (${esc(value)}) Tj ET`;
  const streams = pages.map((page, n) => {
    const out: string[] = [];
    let y = PAGE_H - MARGIN - 12;
    out.push(text(MARGIN, y, "F2", 14, title));
    y -= 15;
    out.push(text(MARGIN, y, "F1", 9, subtitle));
    y -= 22;
    const cells = (values: string[], font: string, at: number) => {
      let x = MARGIN;
      values.forEach((v, i) => { const w = widths[i] ?? 0; out.push(text(x + 2, at, font, FONT, fit(v, w - 4, FONT))); x += w; });
    };
    out.push(`0.9 0.93 0.97 rg ${MARGIN} ${(y - 4).toFixed(1)} ${usable} ${ROW_H} re f 0 0 0 rg`);
    cells(head, "F2", y);
    page.forEach((row) => {
      y -= ROW_H;
      cells(row, "F1", y);
      out.push(`0.8 0.83 0.87 RG 0.4 w ${MARGIN} ${(y - 4).toFixed(1)} m ${PAGE_W - MARGIN} ${(y - 4).toFixed(1)} l S`);
    });
    out.push(text(PAGE_W - MARGIN - 60, MARGIN - 10, "F1", 8, `Page ${n + 1} of ${pages.length}`));
    return out.join("\n");
  });

  // Objects: 1 catalog, 2 page tree, 3-4 fonts, then a page and its content for each page.
  const objects: string[] = [];
  const kids = streams.map((_, i) => `${5 + i * 2} 0 R`).join(" ");
  objects.push("<< /Type /Catalog /Pages 2 0 R >>");
  objects.push(`<< /Type /Pages /Kids [${kids}] /Count ${streams.length} /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] >>`);
  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");
  streams.forEach((body, i) => {
    objects.push(`<< /Type /Page /Parent 2 0 R /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${6 + i * 2} 0 R >>`);
    objects.push(`<< /Length ${body.length} >>\nstream\n${body}\nendstream`);
  });

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((o, i) => { offsets.push(pdf.length); pdf += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const start = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.forEach((o) => { pdf += `${String(o).padStart(10, "0")} 00000 n \n`; });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF\n`;
  // Every character is already single-byte, so positions above are exact byte offsets.
  const bytes = new Uint8Array(pdf.length);
  for (let i = 0; i < pdf.length; i++) bytes[i] = pdf.charCodeAt(i) & 0xff;
  return bytes;
}

/** A paginated, wrapped-text PDF for receipts, reports and other shared documents. */
export function textPdf(title: string, body: string): Uint8Array {
  const pageW = 595, pageH = 842, margin = 38, lineH = 13, fontSize = 9;
  const maxChars = Math.floor((pageW - margin * 2) / (fontSize * 0.52));
  const lines = body.split(/\r?\n/).flatMap((raw) => {
    if (!raw) return [""];
    const result: string[] = [];
    let line = "";
    for (const word of raw.split(/\s+/)) {
      if (word.length > maxChars) {
        if (line) { result.push(line); line = ""; }
        for (let i = 0; i < word.length; i += maxChars) result.push(word.slice(i, i + maxChars));
        continue;
      }
      const next = line ? `${line} ${word}` : word;
      if (next.length > maxChars) { result.push(line); line = word; } else line = next;
    }
    if (line) result.push(line);
    return result;
  });
  const perPage = Math.max(1, Math.floor((pageH - margin * 2 - 42) / lineH));
  const pages: string[][] = [];
  for (let i = 0; i < lines.length; i += perPage) pages.push(lines.slice(i, i + perPage));
  if (!pages.length) pages.push([]);
  const text = (x: number, y: number, font: string, size: number, value: string) => `BT /${font} ${size} Tf ${x.toFixed(1)} ${y.toFixed(1)} Td (${esc(value)}) Tj ET`;
  const streams = pages.map((page, index) => {
    const out = [text(margin, pageH - margin - 14, "F2", 14, title)];
    let y = pageH - margin - 38;
    for (const line of page) { if (line) out.push(text(margin, y, "F1", fontSize, line)); y -= lineH; }
    out.push(text(pageW - margin - 60, margin - 8, "F1", 8, `Page ${index + 1} of ${pages.length}`));
    return out.join("\n");
  });
  const objects: string[] = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Kids [${streams.map((_, i) => `${5 + i * 2} 0 R`).join(" ")}] /Count ${streams.length} /MediaBox [0 0 ${pageW} ${pageH}] >>`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>",
  ];
  streams.forEach((stream, i) => {
    objects.push(`<< /Type /Page /Parent 2 0 R /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${6 + i * 2} 0 R >>`);
    objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
  });
  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((object, i) => { offsets.push(pdf.length); pdf += `${i + 1} 0 obj\n${object}\nendobj\n`; });
  const start = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.forEach((offset) => { pdf += `${String(offset).padStart(10, "0")} 00000 n \n`; });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF\n`;
  const bytes = new Uint8Array(pdf.length);
  for (let i = 0; i < pdf.length; i++) bytes[i] = pdf.charCodeAt(i) & 0xff;
  return bytes;
}
