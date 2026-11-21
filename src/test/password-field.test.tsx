// The shared password box (Field in ui.tsx) warns while Caps Lock is on and stops warning when it is off or the box is left.
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("@/hooks/use-language", () => ({ useLanguage: () => ({ tr: (v: string) => v, dir: "ltr", language: "en" }) }));
import { Field } from "@/components/shopbook/ui";

afterEach(cleanup);

describe("password box", () => {
  it("shows Caps Lock is on while it is, and never for an ordinary box", () => {
    render(<><Field password label="Password" value="" onChange={() => undefined} /><Field label="Email" value="" onChange={() => undefined} /></>);
    const box = screen.getByLabelText("Password");
    fireEvent.keyDown(box, { key: "A", modifierCapsLock: true });
    expect(screen.getByText("Caps Lock is on")).toBeTruthy();
    fireEvent.keyUp(box, { key: "a", modifierCapsLock: false });
    expect(screen.queryByText("Caps Lock is on")).toBeNull();
    fireEvent.keyDown(box, { key: "A", modifierCapsLock: true });
    fireEvent.blur(box);
    expect(screen.queryByText("Caps Lock is on")).toBeNull();
    fireEvent.keyDown(screen.getByLabelText("Email"), { key: "A", modifierCapsLock: true });
    expect(screen.queryByText("Caps Lock is on")).toBeNull();
  });
});
