import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ComponentType, ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { checkPassword, hashPassword } from "@/lib/device-password";
import { LANGS } from "@/lib/i18n";
import { translateText } from "@/lib/interface-translations";
import { store, type Account } from "@/lib/shopbook";

const {
  navigate,
  employeeSignIn,
  signInEmail,
  authenticatedContext,
  currentIdentity,
  toastError,
  toastCall,
} = vi.hoisted(() => {
  const toastCall = Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() });
  return {
    navigate: vi.fn(),
    employeeSignIn: vi.fn(),
    signInEmail: vi.fn(),
    authenticatedContext: vi.fn(),
    currentIdentity: vi.fn(),
    toastError: toastCall.error,
    toastCall,
  };
});

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: unknown) => ({ options }),
  useNavigate: () => navigate,
  useRouterState: (opts: { select: (s: unknown) => unknown }) =>
    opts.select({ location: { pathname: "/" } }),
  Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
}));

vi.mock("sonner", () => ({ toast: toastCall }));
vi.mock("@/hooks/use-language", () => ({
  useLanguage: () => ({ tr: (value: string) => value, dir: "ltr", language: "en" }),
}));
vi.mock("@/lib/staff-session", () => ({
  signInEmployee: employeeSignIn,
  resumeEmployeeSession: vi.fn(),
  takeSignOutNotice: () => null,
}));
vi.mock("@/lib/auth-service", () => ({
  authenticatedContext,
  authMessage: (error: unknown) =>
    error instanceof Error ? error.message : "Authentication failed",
  currentIdentity,
  signInEmail,
  registerEmailIdentity,
}));
const reconcileLegacyOwner = vi.hoisted(() => vi.fn());
const registerEmailIdentity = vi.hoisted(() => vi.fn(async () => { throw new Error("offline"); }));
vi.mock("@/lib/people-access.functions", () => ({ reconcileLegacyOwner }));
vi.mock("@/lib/world-data", () => ({
  detectUserCountry: () => ({ currencyCode: "KES", countryCode: "KEN" }),
}));
vi.mock("@/components/shopbook/auth-card", () => ({
  AuthCard: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  AuthBenefits: () => null,
}));
vi.mock("@/components/shopbook/auth-shell", () => ({
  AuthShell: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/components/shopbook/ui", () => ({
  rememberSignIn: () => undefined,
  Field: ({
    label,
    placeholder,
    value,
    onChange,
    type = "text",
    password,
    required,
    error,
  }: {
    label: string;
    placeholder?: string;
    value: string;
    onChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
    type?: string;
    password?: boolean;
    required?: boolean;
    error?: string;
  }) => (
    <label>
      {label}
      <input
        aria-label={label}
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        type={password ? "password" : type}
        required={required}
      />
      {error && <span role="alert">{error}</span>}
    </label>
  ),
  SocialButtons: () => null,
  TopBar: () => null,
  LogoCropPicker: () => <div>Logo</div>,
  SearchableCurrencyPicker: () => <div>Currency</div>,
  SearchableCountryPicker: () => <div>Country</div>,
}));
vi.mock("@/components/ui/shop-button", () => ({
  ShopButton: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{children}</button>
  ),
}));
vi.mock("@/lib/device-password", () => ({ checkPassword: vi.fn(), hashPassword: vi.fn() }));

const owner = (extra: Partial<Account> = {}): Account => ({
  shopName: "Kifaru General Supplies",
  email: "owner@example.com",
  phone: "0712345678",
  currency: "KES",
  password: "correct-horse",
  plan: "growth",
  ...extra,
});

async function renderRoute(route: "index" | "signup") {
  const { Route } = await import(`@/routes/${route}.tsx`);
  const Screen = (Route as unknown as { options: { component: ComponentType } }).options.component;
  render(<Screen />);
}

function fillLogin(identifier: string, password = "correct-horse") {
  fireEvent.change(screen.getByLabelText("Business Name or Email"), {
    target: { value: identifier },
  });
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: password } });
  fireEvent.submit(screen.getByLabelText("Password").closest("form")!);
}

function fillSignup({
  shopName = "New Shop",
  email = "new@example.com",
  password = "strong-pass1",
} = {}) {
  fireEvent.change(screen.getByLabelText("Business Name"), { target: { value: shopName } });
  fireEvent.change(screen.getByLabelText("Email"), { target: { value: email } });
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: password } });
  fireEvent.change(screen.getByLabelText("Confirm Password"), { target: { value: password } });
  fireEvent.click(screen.getByRole("checkbox"));
}

beforeEach(() => {
  localStorage.clear();
  navigate.mockReset();
  employeeSignIn.mockReset();
  employeeSignIn.mockResolvedValue(undefined);
  signInEmail.mockReset();
  signInEmail.mockRejectedValue(new Error("Invalid login credentials"));
  authenticatedContext.mockReset();
  currentIdentity.mockReset();
  toastError.mockReset();
  toastCall.mockReset();
  vi.mocked(checkPassword).mockImplementation(async (password, saved) => ({
    ok: password === saved,
  }));
  vi.mocked(hashPassword).mockImplementation(async (password) => `hashed:${password}`);
});

afterEach(cleanup);

describe("auth interface translations", () => {
  it.each([
    "Business Name or Email",
    "Business name or email",
    "Welcome back",
    "Enter password",
    "Enter email address",
    "Repeat password",
    "An account with this shop name or email already exists on this device",
    "Incorrect business name, email, or password.",
    "On a new phone or computer, log in with your email.",
    "This business name or email is already registered. Log in instead.",
    "You're offline. You can still log in if you've used the app here before. Google and Apple need internet.",
    "At least 6 characters",
    "You're offline. An account created now works only on this phone or computer. Connect to the internet first to use it anywhere.",
    "e.g. 712 345 678",
    "Can't reach the Zakrio server right now. You can still log in if you've used the app here before.",
    "Need help?",
    "WhatsApp support",
    "Add a passkey on this phone or computer",
    "Passkey sign-in is coming soon. For now, log in with your email, Google or Apple.",
    "Passkeys aren't switched on for this app yet. Use your email and password.",
    "New staff? Open the invitation link your employer sent you to set your password.",
    "You can keep setting up now. Confirm your email later to log in from other phones or computers.",
  ])("translates %s in every offered language", (phrase) => {
    for (const language of LANGS.slice(1)) {
      expect(translateText(language, phrase), `${phrase} in ${language}`).not.toBe(phrase);
    }
  });
});

describe("login route", () => {
  it.each(["Kifaru General Supplies", "OWNER@EXAMPLE.COM"])(
    "signs in an owner by business name or email and opens the app (%s)",
    async (identifier) => {
      store.save(owner({ setupPending: false }));
      await renderRoute("index");
      fillLogin(identifier);
      await waitFor(() => expect(navigate).toHaveBeenCalledWith({ to: "/apps" }));
      expect(store.signedIn()).toBe(true);
      expect(employeeSignIn).not.toHaveBeenCalled();
    },
  );

  it("creates the online account for a business made offline, at its next login with internet", async () => {
    store.save(owner({ setupPending: false, authMigration: { status: "not_started", updatedAt: 1 } }));
    registerEmailIdentity.mockResolvedValueOnce({ user: { id: "u-later", identities: [{}] }, session: null, verificationRequired: true } as never);
    await renderRoute("index");
    fillLogin("owner@example.com");
    await waitFor(() => expect(navigate).toHaveBeenCalledWith({ to: "/apps" }));
    expect(registerEmailIdentity).toHaveBeenCalledWith("owner@example.com", "correct-horse", "Kifaru General Supplies");
    expect(store.get()?.authMigration).toMatchObject({ status: "pending", centralUserId: "u-later" });
    expect(toastCall).toHaveBeenCalledWith(expect.stringContaining("Your account is going online. We sent a link to"));
  });

  it("still logs in a business made offline when there is still no internet, and tries again next time", async () => {
    store.save(owner({ setupPending: false, authMigration: { status: "not_started", updatedAt: 1 } }));
    await renderRoute("index");
    fillLogin("owner@example.com");
    await waitFor(() => expect(navigate).toHaveBeenCalledWith({ to: "/apps" }));
    expect(store.get()?.authMigration?.status).toBe("not_started");
    expect(store.signedIn()).toBe(true);
  });

  it("returns an owner with unfinished setup to Setup", async () => {
    store.save(owner({ setupPending: true }));
    await renderRoute("index");
    fillLogin("owner@example.com");
    await waitFor(() => expect(navigate).toHaveBeenCalledWith({ to: "/setup" }));
  });

  it("links a local owner to their verified online account at login, then opens the apps", async () => {
    store.save(owner({ password: "correct-horse", businessId: "biz-local", authMigration: { status: "pending", updatedAt: 1 } }));
    signInEmail.mockResolvedValue({});
    currentIdentity.mockResolvedValue({ userId: "u1", email: "owner@example.com", verified: true, providers: ["email"] });
    reconcileLegacyOwner.mockResolvedValue({ status: "complete", account: "acc1", business: "b1" });
    authenticatedContext.mockResolvedValue({ kind: "owner", accountId: "acc1", businesses: [], locations: [], subscription: null, syncBusiness: "biz-local" });
    await renderRoute("index");
    fillLogin("owner@example.com");
    await waitFor(() => expect(navigate).toHaveBeenCalledWith({ to: "/apps" }));
    expect(signInEmail).toHaveBeenCalledWith("owner@example.com", "correct-horse");
    expect(reconcileLegacyOwner).toHaveBeenCalledWith({ data: expect.objectContaining({ legacyBusiness: "biz-local", confirm: true }) });
    expect(store.get()?.authMigration).toMatchObject({ status: "complete", centralUserId: "u1", centralAccountId: "acc1" });
  });

  it("still signs a local owner in on this device when the online link isn't ready", async () => {
    store.save(owner({ password: "correct-horse", businessId: "biz-local", authMigration: { status: "pending", updatedAt: 1 } }));
    signInEmail.mockRejectedValue(new Error("Email not confirmed"));
    await renderRoute("index");
    fillLogin("owner@example.com");
    await waitFor(() => expect(navigate).toHaveBeenCalledWith({ to: "/apps" }));
    expect(store.get()?.authMigration?.status).toBe("pending");
  });

  it("never sends anyone to a migration page: a different device business is refused at Log In", async () => {
    reconcileLegacyOwner.mockClear();
    store.save(owner({ email: "someone@example.com", password: "their-pass", businessId: "biz-other", authMigration: { status: "pending", updatedAt: 1 } }));
    employeeSignIn.mockRejectedValue(new Error("Invalid login credentials"));
    signInEmail.mockResolvedValue({});
    authenticatedContext.mockResolvedValue({ kind: "owner", accountId: "acc9", businesses: [], locations: [], subscription: null, syncBusiness: null });
    currentIdentity.mockResolvedValue({ userId: "u9", email: "owner@example.com", verified: true, providers: ["email"] });
    await renderRoute("index");
    fillLogin("owner@example.com", "my-own-pass");
    await waitFor(() => expect(toastError).toHaveBeenCalled());
    expect(navigate).not.toHaveBeenCalledWith(expect.objectContaining({ to: "/account-migration" }));
    expect(reconcileLegacyOwner).not.toHaveBeenCalled();
  });

  it("rejects an incorrect owner password without trying server authentication", async () => {
    store.save(owner());
    await renderRoute("index");
    fillLogin("owner@example.com", "wrong-password");
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Incorrect business name, email, or password.",
      ),
    );
    expect(toastError).not.toHaveBeenCalled();
    expect(employeeSignIn).not.toHaveBeenCalled();
    expect(signInEmail).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });

  it("waits a minute after 5 wrong passwords, even when the next one is right", async () => {
    store.save(owner({ setupPending: false }));
    await renderRoute("index");
    for (let i = 0; i < 5; i++) {
      fillLogin("owner@example.com", "wrong-password");
      await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Incorrect"));
    }
    fillLogin("owner@example.com");
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Too many tries. Wait a minute, or reset your password."));
    expect(navigate).not.toHaveBeenCalled();
    expect(store.signedIn()).toBe(false);
  });

  it("keeps an unknown shop name on login and leaves sign-up explicit", async () => {
    employeeSignIn.mockRejectedValueOnce(new Error("Invalid credentials"));
    await renderRoute("index");
    fillLogin("Unknown Shop");
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Incorrect business name, email, or password. On a new phone or computer, log in with your email.",
      ),
    );
    expect(store.get()).toBeNull();
    expect(navigate).not.toHaveBeenCalled();
    expect(screen.getByRole("link", { name: /Register now/ })).toHaveAttribute("href", "/signup");
  });

  it("signs in an employee by email and opens the app", async () => {
    await renderRoute("index");
    fillLogin("staff@example.com", "staff-password");
    await waitFor(() =>
      expect(employeeSignIn).toHaveBeenCalledWith("staff@example.com", "staff-password"),
    );
    expect(navigate).toHaveBeenCalledWith({ to: "/apps" });
  });

  it("keeps an unsuccessful employee login on the login page", async () => {
    employeeSignIn.mockRejectedValueOnce(new Error("Invalid credentials"));
    await renderRoute("index");
    fillLogin("staff@example.com", "wrong-password");
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Incorrect business name, email, or password.",
      ),
    );
    expect(signInEmail).toHaveBeenCalledWith("staff@example.com", "wrong-password");
    expect(toastError).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });

  it("signs in a verified central owner only after server authorization", async () => {
    employeeSignIn.mockRejectedValueOnce(new Error("Invalid credentials"));
    signInEmail.mockResolvedValueOnce(undefined);
    authenticatedContext.mockResolvedValueOnce({
      kind: "owner",
      accountId: "central-account",
      businesses: [
        {
          id: "business-id",
          name: "Kifaru Supplies",
          currency: "KES",
          legacy_business_id: "device-business",
        },
      ],
      locations: [],
      subscription: {
        plan_id: "growth",
        status: "active",
        billing_cycle: null,
        trial_ends_at: null,
      },
      syncBusiness: "device-business",
    });
    currentIdentity.mockResolvedValueOnce({
      userId: "central-user",
      email: "owner@example.com",
      verified: true,
      providers: ["email"],
    });
    await renderRoute("index");
    fillLogin("owner@example.com", "central-password");
    await waitFor(() => expect(navigate).toHaveBeenCalledWith({ to: "/apps" }));
    expect(store.signedIn()).toBe(true);
    expect(store.get()).toMatchObject({
      shopName: "Kifaru Supplies",
      businessId: "device-business",
      role: "owner",
    });
  });
});

describe("signup route", () => {
  it("starts with a blank phone-number entry that shows an example (owner's request, 2026-11-21)", async () => {
    await renderRoute("signup");
    const phone = screen.getByLabelText("Phone Number");
    expect(phone).toHaveValue("");
    expect(phone).toHaveAttribute("placeholder", "e.g. 712 345 678");
  });

  it("shows required-field errors when submitted empty", async () => {
    await renderRoute("signup");
    fireEvent.submit(screen.getByRole("button", { name: "Create Account" }).closest("form")!);
    expect(screen.getByText("Company name is required")).toBeInTheDocument();
    expect(screen.getByText("Email address is required")).toBeInTheDocument();
    expect(screen.getByText("Password must be at least 6 characters")).toBeInTheDocument();
    expect(screen.getByText("Please accept the Terms & Privacy Policy")).toBeInTheDocument();
  });

  it("accepts any password of 6 or more characters, and shows its strength as advice only", async () => {
    await renderRoute("signup");
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "abcdef" } });
    expect(document.querySelector(".pw-meter")?.textContent).toContain("Weak");
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "Abcdefgh12!x" } });
    expect(document.querySelector(".pw-meter")?.textContent).toContain("Strong");
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "abc12" } });
    fireEvent.change(screen.getByLabelText("Confirm Password"), { target: { value: "abc12" } });
    fireEvent.submit(screen.getByRole("button", { name: "Create Account" }).closest("form")!);
    expect(screen.getByText("Password must be at least 6 characters")).toBeInTheDocument();
  });

  it("opens Verify your email when the new online account still needs its email confirmed", async () => {
    registerEmailIdentity.mockResolvedValueOnce({ user: { id: "u-new", identities: [{}] }, session: null, verificationRequired: true } as never);
    await renderRoute("signup");
    fireEvent.change(screen.getByLabelText("Business Name"), { target: { value: "New Shop" } });
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "new@example.com" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "strong-pass1" } });
    fireEvent.change(screen.getByLabelText("Confirm Password"), { target: { value: "strong-pass1" } });
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.submit(screen.getByRole("button", { name: "Create Account" }).closest("form")!);
    await waitFor(() => expect(navigate).toHaveBeenCalledWith({ to: "/auth/verify", search: { email: "new@example.com" } }));
    expect(store.get()).toMatchObject({ shopName: "New Shop", email: "new@example.com" });
  });

  it("rejects invalid email and mismatched passwords", async () => {
    await renderRoute("signup");
    fireEvent.change(screen.getByLabelText("Business Name"), { target: { value: "New Shop" } });
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "not-an-email" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "strong-pass1" } });
    fireEvent.change(screen.getByLabelText("Confirm Password"), {
      target: { value: "different-pass" },
    });
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.submit(screen.getByRole("button", { name: "Create Account" }).closest("form")!);
    expect(screen.getByText(/valid email address/i)).toBeInTheDocument();
    expect(screen.getByText("Passwords do not match")).toBeInTheDocument();
    expect(store.get()).toBeNull();
    expect(navigate).not.toHaveBeenCalled();
  });

  it.each([
    { shopName: "Kifaru General Supplies", email: "new@example.com" },
    { shopName: "Another Shop", email: "owner@example.com" },
  ])("refuses a duplicate shop name or email", async (duplicate) => {
    store.save(owner());
    await renderRoute("signup");
    fillSignup(duplicate);
    fireEvent.submit(screen.getByRole("button", { name: "Create Account" }).closest("form")!);
    expect(
      screen.getByText("This business name or email is already registered. Log in instead."),
    ).toBeInTheDocument();
    expect(store.get()).toMatchObject({
      shopName: "Kifaru General Supplies",
      email: "owner@example.com",
    });
    expect(navigate).not.toHaveBeenCalled();
  });

  it("ticks matching passwords and has no promo code", async () => {
    await renderRoute("signup");
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "strong-pass1" } });
    fireEvent.change(screen.getByLabelText("Confirm Password"), { target: { value: "strong" } });
    expect(screen.queryByText(/Passwords match/)).toBeNull();
    fireEvent.change(screen.getByLabelText("Confirm Password"), { target: { value: "strong-x" } });
    expect(screen.getByText("Doesn't match yet")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Confirm Password"), { target: { value: "strong-pass1" } });
    expect(screen.getByText(/Passwords match/)).toBeInTheDocument();
    expect(screen.queryByText(/promo/i)).toBeNull();
    fillSignup();
    fireEvent.submit(screen.getByRole("button", { name: "Create Account" }).closest("form")!);
    await waitFor(() => expect(navigate).toHaveBeenCalledWith({ to: "/plans" }));
    expect(store.get()).not.toHaveProperty("promoCode");
  });

  it("registers a valid account, stores a password hash and opens Plans", async () => {
    await renderRoute("signup");
    fillSignup();
    fireEvent.submit(screen.getByRole("button", { name: "Create Account" }).closest("form")!);
    await waitFor(() => expect(navigate).toHaveBeenCalledWith({ to: "/plans" }));
    expect(store.get()).toMatchObject({
      shopName: "New Shop",
      email: "new@example.com",
      password: "hashed:strong-pass1",
    });
    expect(store.signedIn()).toBe(true);
  });
});
