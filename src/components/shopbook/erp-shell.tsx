// Shared compact navy shell for Purchases, Sales, POS and all ERP apps.
import { revealTab } from "@/lib/fit-text";
import { Children, Fragment, cloneElement, isValidElement, useRef, type ReactElement, type ReactNode } from "react";
import { useScreenFit } from "@/lib/fill-screen";
import { Search as SearchIcon } from "lucide-react";
import { ShopButton } from "@/components/ui/shop-button";
import { GlobalApplicationHeader } from "@/components/shopbook/global-application-header";
import { useLanguage } from "@/hooks/use-language";
import { BackupStatus } from "@/components/shopbook/backup-status";
import type { HeaderPeriod } from "@/lib/period";
import { cn } from "@/lib/utils";

export type Tr = (t: string) => string;

type Props = { className?: string; children?: ReactNode };
const isHeading = (n: ReactNode): n is ReactElement<Props> =>
  isValidElement<Props>(n) && typeof n.type === "string" && /\bmoney-heading\b/.test(n.props.className ?? "");
/** Expands fragments so headings written inside `<>…</>` are found too. */
const flat = (nodes: ReactNode, prefix = ""): ReactNode[] =>
  Children.toArray(nodes).flatMap((n) => {
    if (isValidElement<Props>(n) && n.type === Fragment) return flat(n.props.children, `${prefix}${String(n.key)}/`);
    // Children of different fragments get the same keys (.0, .1…) from toArray; the fragment's own key keeps them unique.
    return [prefix && isValidElement(n) ? cloneElement(n, { key: `${prefix}${String(n.key)}` }) : n];
  });

/** Liquid Glass sections: every `money-heading` title and the rows after it become one separate glass
 *  card, so titled lists never float loose on the page. Content without such titles is returned as it
 *  is, and a `.money-screen` wrapper is grouped inside. Purely presentational: nothing is re-ordered. */
export function glassSections(children: ReactNode): ReactNode {
  const nodes = flat(children);
  if (!nodes.some(isHeading)) {
    return nodes.map((n) =>
      isValidElement<Props>(n) && typeof n.type === "string" && /\bmoney-screen\b/.test(n.props.className ?? "")
        ? cloneElement(n, undefined, glassSections(n.props.children))
        : n,
    );
  }
  // Items before the first title stay loose; each title starts a new group that runs to the next title.
  const parts: (ReactNode | ReactNode[])[] = [];
  nodes.forEach((n) => {
    const last = parts[parts.length - 1];
    if (isHeading(n)) parts.push([n]);
    else if (Array.isArray(last)) last.push(n);
    else parts.push(n);
  });
  return parts.map((p, i) => (Array.isArray(p) ? <section key={`glass-${i}`} className="glass-section">{p}</section> : p));
}

export function ErpShell({
  title,
  shop,
  menus,
  menu,
  sub,
  onMenu,
  onSub,
  children,
  hideSub,
  period,
  branded,
  labels,
}: {
  title: string;
  shop: string;
  menus: Record<string, readonly string[]>;
  menu: string;
  sub: string;
  onMenu: (m: string) => void;
  onSub: (s: string) => void;
  children: ReactNode;
  deps?: unknown;
  hideSub?: boolean;
  /** Given only on screens that filter by date; everywhere else the header has no calendar. */
  period?: HeaderPeriod | undefined;
  /** The shop and then the app name in the centre of the header. */
  branded?: boolean | undefined;
  /** A menu's shown name when it isn't the translated key (Float's Cash, M-Pesa and Bank show the business's names for them). */
  labels?: Record<string, string> | undefined;
}) {
  const { tr: translate, dir } = useLanguage();
  const tr = (k: string) => labels?.[k] ?? translate(k);
  const subs = menus[menu] ?? [];
  // Tablets, laptops and desktops: the whole app screen on one full screen (src/lib/fill-screen.ts).
  const screenRef = useRef<HTMLElement>(null);
  useScreenFit(screenRef, { min: 1, scroller: ".inventory-content" }); // min 1: text keeps its size, long content scrolls inside

  return (
    <main ref={screenRef} dir={dir} className="shop-app inventory-screen fit-screen flex w-full flex-col">
      <header className="sticky top-0 z-20 border-b border-border bg-background/95 backdrop-blur">
        <GlobalApplicationHeader
          title={title}
          shop={shop}
          moduleFirst={!branded}
          branded={branded}
          menus={Object.keys(menus)}
          menu={menu}
          onMenu={onMenu}
          period={period}
        />
        <BackupStatus />
        <Tabs items={Object.keys(menus)} value={menu} onChange={onMenu} tr={tr} />
        {!hideSub && subs.length > 0 && (
          <Tabs small items={[...subs]} value={sub} onChange={onSub} tr={tr} />
        )}
      </header>
      <section className="inventory-content flex-1">{glassSections(children)}</section>
    </main>
  );
}

export function Tabs({
  items,
  value,
  onChange,
  tr,
  small,
}: {
  items: string[];
  value: string;
  onChange: (v: string) => void;
  tr: Tr;
  small?: boolean;
}) {
  return (
    <div role="tablist" className={cn("inventory-tabs", small && "inventory-tabs-sub")}>
      {items.map((k) => (
        <ShopButton
          variant="bare"
          role="tab"
          aria-selected={value === k}
          ref={value === k ? revealTab : null}
          key={k}
          onClick={() => onChange(k)}
          className="inventory-tab"
        >
          {tr(k)}
        </ShopButton>
      ))}
    </div>
  );
}
export const Empty = ({ children }: { children: ReactNode }) => (
  <p className="dash-empty">{children}</p>
);
export function Box({
  title,
  action,
  children,
}: {
  title: ReactNode;
  action?: (() => void) | undefined;
  children: ReactNode;
}) {
  const { tr } = useLanguage();
  return (
    <div className="inventory-box dash-panel">
      <div className="dash-panel-head">
        <h2 className="dash-panel-title">{title}</h2>
        {action && (
          <ShopButton variant="bare" className="dash-link" onClick={action}>
            {tr("View All")} ›
          </ShopButton>
        )}
      </div>
      {children}
    </div>
  );
}
export type Tone = "ok" | "warn" | "bad" | "info";
export const toneOf = (s: string): Tone =>
  s === "Paid" || s === "Completed" || s === "Active"
    ? "ok"
    : s === "Over plan" || s === "P.PAY" || s === "Pending" || s === "Draft" || s === "Due" || s === "Partially Paid" || s === "Partially Received" || s === "Partly Returned" || s === "Returned"
      ? "warn"
      : s === "Credit" || s === "Sent" || s === "Unpaid" || s === "Inactive"
        ? "info"
        : "bad";
export function Badge({ s }: { s: string }) {
  const { tr } = useLanguage();
  return (
    <span className={cn("pur-badge", `pur-badge-${toneOf(s)}`)}>
      {s === "P.PAY" ? "P.PAY" : tr(s)}
    </span>
  );
}
export const Dot = ({ tone }: { tone: Tone }) => (
  <span
    className={cn(
      "inventory-dot",
      tone === "warn" && "inventory-dot-low",
      tone === "bad" && "inventory-dot-out",
      tone === "info" && "inventory-dot-info",
    )}
  />
);
/** One record = one line; extra columns scroll sideways instead of wrapping. */
export const Row = ({
  children,
  onClick,
}: {
  children: ReactNode;
  onClick?: (() => void) | undefined;
}) => (
  <div className={cn("pur-row", onClick && "cursor-pointer")} onClick={onClick}>
    {children}
  </div>
);
export function Search({
  q,
  setQ,
  tr,
  ph,
}: {
  q: string;
  setQ: (v: string) => void;
  tr: Tr;
  ph: string;
}) {
  return (
    <div className="inventory-search mb-1.5">
      <SearchIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={tr(ph)}
        aria-label={tr(ph)}
      />
    </div>
  );
}
export const BigButton = ({ children, onClick }: { children: ReactNode; onClick: () => void }) => (
  <ShopButton className="inventory-save mb-2 w-full text-[13px] font-bold" onClick={onClick}>
    {children}
  </ShopButton>
);
/** Total / Paid / Balance trio used on purchase and sale details. */
export function MoneyTrio({
  total,
  paid,
  balance,
  money,
  tr,
}: {
  total: number;
  paid: number;
  balance: number;
  money: (n: number) => string;
  tr: Tr;
}) {
  return (
    <div className="mt-2 grid grid-cols-3 gap-1.5 text-center">
      {(
        [
          ["Total", total, ""],
          ["Paid", paid, ""],
          ["Balance", balance, balance > 0 ? "text-destructive" : ""],
        ] as const
      ).map(([k, v, c]) => (
        <div key={k} className="inventory-box mt-0">
          <p className={cn("text-[11px] text-primary", c)}>{tr(k)}</p>
          <p
            className={cn(
              "text-[13px] font-bold tabular-nums",
              balance > 0 && k === "Balance" && "text-warning",
            )}
          >
            {money(v)}
          </p>
        </div>
      ))}
    </div>
  );
}
