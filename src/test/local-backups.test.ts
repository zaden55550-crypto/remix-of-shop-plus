import { describe, expect, it } from "vitest";
import { empty } from "@/lib/erp";
import { decryptBackup, encryptBackup } from "@/lib/local-backups";

const plain = JSON.stringify({ app: "SHOPBOOK", version: 2, shop: "Test Shop", at: 1, data: empty(), settings: {}, business: null });

describe("encrypted external backups", () => {
  it("encrypts and decrypts without changing the backup payload", async () => {
    const encrypted = await encryptBackup(plain, "correct horse battery staple");
    expect(JSON.parse(encrypted)).toMatchObject({ app: "SHOPPLUS-ENCRYPTED", version: 1, kdf: "PBKDF2-SHA-256", iterations: 310_000 });
    expect(await decryptBackup(encrypted, "correct horse battery staple")).toBe(plain);
  });

  it("rejects a wrong passphrase and preserves legacy JSON restore compatibility", async () => {
    const encrypted = await encryptBackup(plain, "correct horse battery staple");
    await expect(decryptBackup(encrypted, "incorrect passphrase here")).rejects.toThrow(/passphrase is incorrect/);
    expect(await decryptBackup(plain, "unused passphrase" )).toBe(plain);
  });

  it("requires a strong passphrase", async () => {
    await expect(encryptBackup(plain, "short")).rejects.toThrow(/at least 12 characters/);
  });
});
