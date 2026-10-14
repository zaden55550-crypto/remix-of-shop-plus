/** Saves a file on phones, tablets and computers. Call synchronously from a click so iOS keeps the tap. */
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.rel = "noopener"; a.style.display = "none";
  document.body.appendChild(a); a.click(); a.remove();
  // Revoking immediately cancels the download on Safari/iPad, so wait.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
export const download = (name: string, text: string, type = "text/csv") => downloadBlob(new Blob(["\ufeff" + text], { type: `${type};charset=utf-8` }), name);
