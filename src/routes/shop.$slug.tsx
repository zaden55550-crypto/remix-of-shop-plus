// The public online shop page (owner, 2026-11-23): /shop/<link> shows a business's products with prices and whether they are in
// stock, and an Order on WhatsApp button. Anyone with the link can open it; it shows only what the owner switched on (proposed 0023).
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

type Catalog = { title: string; whatsapp: string | null; products: { name: string; price: number; unit: string | null; inStock: boolean }[] };
export const Route = createFileRoute("/shop/$slug")({ component: PublicShop });

function PublicShop() {
  const { slug } = Route.useParams();
  const [data, setData] = useState<Catalog | null | "missing">(null);
  const [q, setQ] = useState(""), [cart, setCart] = useState<Record<string, number>>({});
  useEffect(() => {
    void (supabase.rpc as unknown as (fn: string, a: object) => Promise<{ data: Catalog | null; error: unknown }>)("public_shop_catalog", { p_slug: slug })
      .then((r) => setData(r.error || !r.data ? "missing" : r.data), () => setData("missing"));
  }, [slug]);
  const list = useMemo(() => (data && data !== "missing" ? data.products.filter((p) => p.name.toLowerCase().includes(q.toLowerCase())) : []), [data, q]);
  if (data === null) return <main className="pshop"><p>Loading…</p></main>;
  if (data === "missing") return <main className="pshop"><h1>Shop not found</h1><p>This shop link isn't available.</p></main>;
  const picked = Object.entries(cart).filter(([, n]) => n > 0);
  const total = picked.reduce((a, [name, n]) => a + n * (data.products.find((p) => p.name === name)?.price ?? 0), 0);
  const order = `Hello ${data.title}, I'd like to order:\n${picked.map(([name, n]) => `- ${name} × ${n}`).join("\n")}\nTotal about ${total.toLocaleString("en-KE")}`;
  return <main className="pshop">
    <h1>{data.title}</h1>
    <input className="pshop-search" placeholder="Search products" value={q} onChange={(e) => setQ(e.target.value)} />
    <ul className="pshop-list">{list.map((p) => <li key={p.name} className={p.inStock ? undefined : "is-out"}>
      <span><b>{p.name}</b><small>{p.price.toLocaleString("en-KE")}{p.unit ? ` / ${p.unit}` : ""}{p.inStock ? "" : " · out of stock"}</small></span>
      {p.inStock && <span className="pshop-qty"><button type="button" onClick={() => setCart({ ...cart, [p.name]: Math.max(0, (cart[p.name] ?? 0) - 1) })}>−</button><b>{cart[p.name] ?? 0}</b><button type="button" onClick={() => setCart({ ...cart, [p.name]: (cart[p.name] ?? 0) + 1 })}>+</button></span>}
    </li>)}</ul>
    {data.whatsapp && picked.length > 0 && <a className="pshop-order" href={`https://wa.me/${data.whatsapp}?text=${encodeURIComponent(order)}`} target="_blank" rel="noopener">Order on WhatsApp · {total.toLocaleString("en-KE")}</a>}
    <p className="pshop-foot">Powered by DataQuill Solutions</p>
  </main>;
}
