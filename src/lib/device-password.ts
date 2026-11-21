// The owner's device login. It keeps a salted hash, never the password, so reading the browser's storage doesn't reveal it.
// This is a stopgap: the device still decides for itself, so it does not replace the move to Cloud sign-in.
const PREFIX = "pbkdf2-sha256";
const ROUNDS = 310000;
const hex = (b: ArrayBuffer | Uint8Array) => Array.from(b instanceof Uint8Array ? b : new Uint8Array(b)).map((x) => x.toString(16).padStart(2, "0")).join("");
const bytes = (h: string) => Uint8Array.from(h.match(/../g) ?? [], (x) => parseInt(x, 16));

async function derive(password: string, salt: Uint8Array, rounds: number) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  return hex(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: salt as BufferSource, iterations: rounds }, key, 256));
}
/** Browsers offer hashing only on https and localhost. A phone testing over plain http keeps working, and upgrades at its next secure sign-in. */
const canHash = () => typeof crypto !== "undefined" && Boolean(crypto.subtle);
export const isHashed = (stored: string) => stored.startsWith(`${PREFIX}$`);

export async function hashPassword(password: string) {
  if (!canHash()) return password;
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return `${PREFIX}$${ROUNDS}$${hex(salt)}$${await derive(password, salt, ROUNDS)}`;
}

/** `upgrade` is set when an older plain-text password matched, so the caller can store the hash in its place. */
export async function checkPassword(password: string, stored: string | undefined): Promise<{ ok: boolean; upgrade?: string | undefined }> {
  if (!stored) return { ok: false };
  if (!isHashed(stored)) {
    if (stored !== password) return { ok: false };
    const next = await hashPassword(password);
    return { ok: true, upgrade: isHashed(next) ? next : undefined };
  }
  if (!canHash()) return { ok: false };
  const [, rounds, salt, want] = stored.split("$");
  if (!rounds || !salt || !want) return { ok: false };
  const got = await derive(password, bytes(salt), Number(rounds));
  let diff = got.length ^ want.length;
  for (let i = 0; i < got.length; i++) diff |= got.charCodeAt(i) ^ want.charCodeAt(i);
  return { ok: diff === 0 };
}
