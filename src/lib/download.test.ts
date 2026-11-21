import { describe, expect, it, vi } from "vitest";
import { shareBlob } from "@/lib/download";

describe("shareBlob PDF handoff", () => {
  it("passes a PDF file to the device share sheet", async () => {
    const oldShare = Object.getOwnPropertyDescriptor(navigator, "share");
    const oldCanShare = Object.getOwnPropertyDescriptor(navigator, "canShare");
    const share = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "share", { configurable: true, value: share });
    Object.defineProperty(navigator, "canShare", { configurable: true, value: () => true });
    try {
      const result = await shareBlob(new Blob(["%PDF-1.4"], { type: "application/pdf" }), "receipt.pdf", "Receipt");
      expect(result).toBe("shared");
      expect(share).toHaveBeenCalledOnce();
      const payload = share.mock.calls[0]?.[0] as ShareData | undefined;
      const file = payload?.files?.[0];
      expect(file).toBeInstanceOf(File);
      if (!file) throw new Error("No shared file received");
      expect(file.name).toBe("receipt.pdf");
      expect(file.type).toBe("application/pdf");
    } finally {
      if (oldShare) Object.defineProperty(navigator, "share", oldShare);
      else Reflect.deleteProperty(navigator, "share");
      if (oldCanShare) Object.defineProperty(navigator, "canShare", oldCanShare);
      else Reflect.deleteProperty(navigator, "canShare");
    }
  });
});
