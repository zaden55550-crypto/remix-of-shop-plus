// Links from the Dashboard open a specific screen of another app: `?menu=…&sub=…` names its starting tab
// (and `filter` an optional list filter). Only real tabs of that app are honoured; anything else falls back
// to the app's usual start screen, so a stale or edited link can never open a broken view.
export type ViewSearch = { menu?: string | undefined; sub?: string | undefined; filter?: string | undefined };

const str = (v: unknown) => (typeof v === "string" && v.length <= 60 ? v : undefined);

/** Route `validateSearch`: keeps only short string values and drops everything else. */
export const viewSearch = (search: Record<string, unknown>): ViewSearch => ({ menu: str(search["menu"]), sub: str(search["sub"]), filter: str(search["filter"]) });

/** Starting [menu, sub]: the linked tab when it exists in `menus`, otherwise `fallback`. */
export function startView(menus: Record<string, readonly string[]>, search: ViewSearch, fallback: string, fallbackSub = ""): [string, string] {
  const menu = search.menu;
  if (!menu || !Object.hasOwn(menus, menu)) return [fallback, fallbackSub];
  const subs = menus[menu] ?? [];
  return [menu, search.sub && subs.includes(search.sub) ? search.sub : (subs[0] ?? "")];
}
