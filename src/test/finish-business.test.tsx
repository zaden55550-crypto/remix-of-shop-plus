// The "Finish your business" window after a first Google or Apple sign-in (owner, 2026-11-25).
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FinishBusiness } from "@/components/shopbook/finish-business";

afterEach(cleanup);
describe("Finish your business", () => {
  it("asks for the name and a real phone before creating anything", async () => {
    const done = vi.fn(async () => undefined);
    render(<FinishBusiness email="amina@gmail.com" onDone={done} onCancel={() => undefined} />);
    expect(screen.getByText(/amina@gmail.com/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    await waitFor(() => expect(screen.getAllByRole("alert").length).toBe(2));
    expect(done).not.toHaveBeenCalled();
    fireEvent.change(screen.getByPlaceholderText("e.g. Mama Njeri Supermarket"), { target: { value: " Mama Njeri Supermarket " } });
    fireEvent.change(screen.getByPlaceholderText("0712 345 678"), { target: { value: "0712345678" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    await waitFor(() => expect(done).toHaveBeenCalledTimes(1));
    const d = (done.mock.calls[0] as unknown as [{ shopName: string; phone: string; country: string; currency: string }])[0];
    expect(d.shopName).toBe("Mama Njeri Supermarket");
    expect(d.phone.replace(/\D/g, "")).toMatch(/712345678$/);
    expect(d.country).toBeTruthy();
    expect(d.currency).toBeTruthy();
  });
});
