/**
 * RFC 4122 v4 UUIDs everywhere the app runs. crypto.randomUUID only exists in secure contexts
 * (https or localhost), so a phone opening the app over the local network (http://192.168.x.x)
 * would crash on it. crypto.getRandomValues works in every context and gives the same format.
 */
export function randomUUID(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6]! & 0x0f) | 0x40;
  b[8] = (b[8]! & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
