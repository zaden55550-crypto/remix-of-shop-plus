import { act, cleanup, fireEvent, render, within } from "@testing-library/react";
import type { MouseEventHandler, ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const routeState = vi.hoisted(() => ({ pathname: "/signup", navigate: vi.fn() }));

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to, onClick }: { children: ReactNode; to: string; onClick?: MouseEventHandler<HTMLAnchorElement> }) => (
    <a href={to} onClick={onClick}>{children}</a>
  ),
  useNavigate: () => routeState.navigate,
  useRouterState: ({ select }: { select: (state: unknown) => unknown }) =>
    select({ location: { pathname: routeState.pathname } }),
}));
vi.mock("@/components/shopbook/ui", () => ({
  TopBar: () => <div data-testid="auth-topbar" />,
  BrandRing: () => <div data-testid="brand-ring" />,
  ZakrioMark: () => <span data-testid="zakrio-mark" />,
  rememberSignIn: () => undefined,
}));
vi.mock("@/components/shopbook/auth-card", () => ({
  AuthBenefits: () => <div className="auth-benefits" data-testid="auth-benefits" />,
}));
vi.mock("@/hooks/use-language", () => ({ useLanguage: () => ({ tr: (value: string) => value, dir: "ltr" }) }));

import { AuthShell } from "@/components/shopbook/auth-shell";

function AuthRoutes() {
  const signup = routeState.pathname === "/signup";
  return (
    <AuthShell>
      <div data-testid="route-fields">{signup ? "Signup fields" : "Login fields"}</div>
    </AuthShell>
  );
}

function setViewport(width: number) {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn((query: string) => ({
      matches: query.includes("prefers-reduced-motion") ? false : query.includes("min-width: 1100px") && width >= 1100,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

beforeEach(() => {
  routeState.pathname = "/signup";
  routeState.navigate.mockReset();
  vi.useFakeTimers();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("persistent auth panel transitions", () => {
  it("slides the welcome half over the form in both directions on wide screens", () => {
    setViewport(1440);
    const view = render(<AuthRoutes />);
    const card = view.container.querySelector(".auth-card");
    const badges = view.getByTestId("auth-benefits");
    const topbar = view.getByTestId("auth-topbar");
    const cardQueries = within(card as HTMLElement);

    expect(card).toHaveAttribute("data-mode", "signup");
    expect(cardQueries.getByRole("link", { name: "Log In" })).toBeInTheDocument();

    fireEvent.click(cardQueries.getByRole("link", { name: "Log In" }));
    expect(routeState.navigate).toHaveBeenCalledWith({ to: "/" });
    routeState.pathname = "/";
    view.rerender(<AuthRoutes />);

    expect(view.container.querySelector(".auth-card")).toBe(card);
    expect(view.getByTestId("auth-benefits")).toBe(badges);
    expect(view.getByTestId("auth-topbar")).toBe(topbar);
    expect(view.getByTestId("route-fields")).toHaveTextContent("Login fields");
    expect(card).toHaveAttribute("data-mode", "login");
    expect(card).toHaveAttribute("data-transitioning", "true");
    expect(cardQueries.getByRole("heading", { name: "Welcome back" })).toBeInTheDocument();

    act(() => { vi.advanceTimersByTime(560); });
    expect(cardQueries.getByRole("heading", { name: "Hello there" })).toBeInTheDocument();
    expect(cardQueries.getByRole("link", { name: "Sign Up" })).toBeInTheDocument();

    fireEvent.click(cardQueries.getByRole("link", { name: "Sign Up" }));
    expect(routeState.navigate).toHaveBeenLastCalledWith({ to: "/signup" });
    routeState.pathname = "/signup";
    view.rerender(<AuthRoutes />);
    expect(card).toHaveAttribute("data-mode", "signup");
    expect(cardQueries.getByRole("heading", { name: "Hello there" })).toBeInTheDocument();
    expect(view.getByTestId("route-fields")).toHaveTextContent("Signup fields");

    act(() => { vi.advanceTimersByTime(560); });
    expect(cardQueries.getByRole("heading", { name: "Welcome back" })).toBeInTheDocument();
    expect(cardQueries.getByRole("link", { name: "Log In" })).toBeInTheDocument();
  });

  it.each([1024, 390])("keeps the existing in-card content slide at %i px", (width) => {
    setViewport(width);
    const view = render(<AuthRoutes />);
    const card = view.container.querySelector(".auth-card");
    const benefits = view.getByTestId("auth-benefits");
    const cardQueries = within(card as HTMLElement);

    fireEvent.click(cardQueries.getByRole("link", { name: "Log In" }));
    expect(card).toHaveAttribute("data-leave", "login");
    expect(routeState.navigate).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(240); });
    expect(routeState.navigate).toHaveBeenCalledWith({ to: "/" });

    routeState.pathname = "/";
    view.rerender(<AuthRoutes />);
    expect(view.container.querySelector(".auth-card")).toBe(card);
    expect(view.getByTestId("auth-benefits")).toBe(benefits);
    expect(card).toHaveAttribute("data-enter", "login");
    expect(view.getByTestId("route-fields")).toHaveTextContent("Login fields");
    expect(cardQueries.getByRole("heading", { name: "Hello there" })).toBeInTheDocument();

    act(() => { vi.advanceTimersByTime(380); });
    fireEvent.click(cardQueries.getByRole("link", { name: "Sign Up" }));
    expect(card).toHaveAttribute("data-leave", "signup");
    act(() => { vi.advanceTimersByTime(240); });
    expect(routeState.navigate).toHaveBeenLastCalledWith({ to: "/signup" });

    routeState.pathname = "/signup";
    view.rerender(<AuthRoutes />);
    expect(view.container.querySelector(".auth-card")).toBe(card);
    expect(view.getByTestId("auth-benefits")).toBe(benefits);
    expect(card).toHaveAttribute("data-enter", "signup");
    expect(view.getByTestId("route-fields")).toHaveTextContent("Signup fields");
    expect(cardQueries.getByRole("heading", { name: "Welcome back" })).toBeInTheDocument();
  });
});
