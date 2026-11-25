import { ModuleCharts } from "@/components/shopbook/analytics-charts";
import { GlassPage } from "@/components/shopbook/glass-page";
import { usePeriod } from "@/lib/period";
import { createFileRoute } from "@tanstack/react-router";
import { startView, viewSearch } from "@/lib/deep-link";
import { useState } from "react";
import { Users, Truck, ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { ShopButton } from "@/components/ui/shop-button";
import { useShopErp } from "@/components/shopbook/product-search";
import { dt, moneyFor, run, useAccount } from "@/components/shopbook/selling";
import { ErpShell, Tabs, Search, Empty } from "@/components/shopbook/erp-shell";
import { Kpi, KpiRow } from "@/components/shopbook/kpi";
import { AmountRow, ActivityList, MoneyDetail } from "@/components/shopbook/money-ui";
import { Field, PaymentForm } from "@/components/shopbook/people-ui";
import { SearchPicker } from "@/components/shopbook/search-picker";
import { useLanguage } from "@/hooks/use-language";
import { financialActivity, type MoneyActivity } from "@/lib/money-activity";
import { saveContact, addContactCategory, type ContactInput } from "@/lib/people";
import { useFeature } from "@/lib/use-features";
import { paidAmount, type Customer, type Supplier, type OtherContact } from "@/lib/erp";

export const Route = createFileRoute("/contacts")({ head: () => ({ meta: [
 { title: "Contacts — DataQuill Solutions" }, { name: "description", content: "Compact customer and supplier profiles, balances, payments, histories and other contacts." },
 { property: "og:title", content: "Contacts — DataQuill Solutions" }, { property: "og:description", content: "Manage shared DataQuill Solutions contacts and outstanding balances." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
] }), validateSearch: viewSearch, component: Contacts });
const MENUS: Record<string, readonly string[]> = { Overview: [], Customers: ["All Customers", "Add Customer", "Balances", "History"], Suppliers: ["All Suppliers", "Add Supplier", "Balances", "History"], "Other Contacts": ["All Contacts", "Add Contact", "Categories", "History"] };
type Contact = Customer | Supplier | OtherContact;
const initial: ContactInput = { name: "", phone: "", email: "", address: "", notes: "", category: "", info: "", active: true };
function Contacts() {
 const acct = useAccount("growth"), s = useShopErp(); const { tr } = useLanguage(); const per = usePeriod(null);
 // A Dashboard link may name the starting tab (?menu=…&sub=…).
 const search = Route.useSearch();
 const [start] = useState(() => startView(MENUS, search, "Overview"));
 const [menu, setMenu] = useState(start[0]), [sub, setSub] = useState(start[1]);
 const [q, setQ] = useState(""), [id, setId] = useState<string | null>(null), [profileTab, setProfileTab] = useState("Overview");
 const [form, setForm] = useState<ContactInput>(initial), [editing, setEditing] = useState(false), [paying, setPaying] = useState(false), [category, setCategory] = useState("");
 const [detail, setDetail] = useState<MoneyActivity | null>(null);
 // Wholesale & retail prices: a customer may be a wholesale customer (wholesale prices whatever the quantity).
 const levels = useFeature("priceLevels");
 if (!acct) return <main className="app-screen" />;
 const money = moneyFor(acct.currency || "KSh");
 const kind = menu === "Suppliers" ? "suppliers" : menu === "Other Contacts" ? "otherContacts" : "customers";
 const list = s[kind], selected: Contact | undefined = list.find((x) => x.id === id);
 const receivable = s.customers.reduce((a, x) => a + Math.max(0, x.balance), 0), payable = s.suppliers.reduce((a, x) => a + Math.max(0, x.balance), 0);
 const all = financialActivity(s);
 const go = (m: string) => { setMenu(m); setSub(MENUS[m]?.[0] ?? ""); setId(null); setEditing(false); setPaying(false); setQ(""); setForm(initial); };
 const open = (m: string, x: Contact) => { go(m); setId(x.id); setProfileTab("Overview"); };
 const heading = (x: string) => <h2 className="money-heading">{tr(x)}</h2>;
 const rows = (rr: Contact[], m = menu) => rr.map((x) => <ShopButton variant="bare" className="money-record" key={x.id} onClick={() => open(m, x)}><span className="pur-name">{x.name}</span><span className="pur-muted">{x.phone || "—"}</span><span className={"balance" in x && x.balance > 0 ? "pur-amt text-destructive" : "pur-amt"}>{"balance" in x ? money(x.balance) : x.category || "—"}</span><span>›</span></ShopButton>);
 const formView = <div className="inventory-form">{heading(editing ? "Edit details" : sub)}{(["name", "phone", "email", "address", ...(kind === "suppliers" ? ["info"] : []), "notes"] as const).map((k) => <Field key={k} label={tr(k === "name" ? "Name *" : k === "info" ? "Business Information" : k.charAt(0).toUpperCase() + k.slice(1))}><input className="inventory-input" aria-label={k} type={k === "email" ? "email" : "text"} maxLength={k === "notes" ? 1000 : 160} value={String(form[k as keyof ContactInput] ?? "")} onChange={(e) => setForm({ ...form, [k]: e.target.value })} /></Field>)}{kind === "otherContacts" && <Field group label={tr("Category")}><SearchPicker tr={tr} items={s.contactCategories.map((c) => ({ id: c.name, label: c.name }))} value={form.category ?? ""} onChange={(v) => setForm({ ...form, category: v })} noneLabel="—" placeholder={tr("Select category")} addLabel={tr("Add Category")} onAdd={(n) => run(() => addContactCategory(n))?.name} /></Field>}{kind === "customers" && levels && <label className="flex items-center gap-2 wholesale-customer-tick"><input type="checkbox" checked={!!form.wholesale} onChange={(e) => setForm({ ...form, wholesale: e.target.checked || undefined })} /><span><b>{tr("Wholesale customer")}</b> · {tr("gets each product's wholesale price whatever the quantity")}</span></label>}{editing && <label className="flex items-center gap-2"><input type="checkbox" checked={form.active !== false} onChange={(e) => setForm({ ...form, active: e.target.checked })} />{tr("Active")}</label>}<ShopButton className="inventory-save" onClick={() => { const x = run(() => saveContact(kind, form, editing ? id ?? undefined : undefined), tr("Saved")); if (x) { setId(x.id); setEditing(false); setForm(initial); } }}>{tr(kind === "suppliers" ? "Save Supplier" : kind === "customers" ? "Save Customer" : "Save Contact")}</ShopButton></div>;
 let profileRows: MoneyActivity[] = [];
 if (selected && kind !== "otherContacts") {
  const docs = kind === "customers" ? s.sales.filter((x) => x.customerId === id) : s.purchases.filter((x) => x.supplierId === id);
  const refs = docs.map((x) => x.ref);
  profileRows = all.filter((x) => refs.includes(x.ref) || x.source === selected.name || refs.includes(x.source) || (kind === "customers" ? s.returns.some((r) => r.ref === x.ref && refs.includes(r.saleRef)) : s.purchaseReturns.some((r) => r.ref === x.ref && refs.includes(r.purchaseRef))));
 }
 return <ErpShell period={menu === "Overview" ? per : undefined} title="Contacts" shop={acct.shopName} menus={MENUS} menu={menu} sub={sub} onMenu={go} onSub={(v) => { setSub(v); setId(null); setEditing(false); setPaying(false); setForm(initial); }} deps={s}><div className="money-screen">
 {selected && <GlassPage label={selected.name} onClose={() => { setId(null); setEditing(false); setPaying(false); }}><div className="money-screen"><div className="money-line"><ShopButton variant="bare" className="money-small-action" onClick={() => { setId(null); setEditing(false); }}>← {selected.name}</ShopButton><ShopButton variant="bare" className="money-small-action" onClick={() => { setForm({ ...initial, ...selected }); setEditing(!editing); }}>{tr("Edit")}</ShopButton></div>
 {editing ? formView : <>
 {"balance" in selected && <KpiRow><Kpi tone={kind === "customers" ? "good" : "info"} label={tr(kind === "customers" ? "Sales" : "Purchases")} value={money(profileRows.filter((x) => x.group === (kind === "customers" ? "Sales" : "Purchases")).reduce((a, x) => a + x.amount, 0))} /><Kpi tone="good" label={tr("Paid")} value={money(kind === "customers" ? s.payments.filter((p) => p.customerId === id && ["SALE", "DEBT"].includes(p.kind)).reduce((a, p) => a + p.amount, 0) : s.purchases.filter((x) => x.supplierId === id).reduce((a, x) => a + paidAmount(x.pay) + (x.settled ?? 0), 0))} /><Kpi tone="bad" label={tr("Returns")} value={money(profileRows.filter((x) => x.group === "Returns").reduce((a, x) => a + x.amount, 0))} /><Kpi label={tr("Balance")} value={money(selected.balance)} tone={selected.balance > 0 ? "bad" : "warn"} /></KpiRow>}
 <Tabs small items={kind === "otherContacts" ? ["Overview", "History"] : ["Overview", kind === "customers" ? "Sales" : "Purchases", "Payments", "Returns", "History"]} value={profileTab} onChange={setProfileTab} tr={tr} />
 {profileTab === "Overview" && <>{(["name", "phone", "email", "address", "notes"] as const).map((k) => <AmountRow key={k} label={tr(k.charAt(0).toUpperCase() + k.slice(1))} value={String((selected as ContactInput)[k] || "—")} />)}<AmountRow label={tr("Status")} value={tr((selected as ContactInput).active === false ? "Inactive" : "Active")} />{"info" in selected && <AmountRow label={tr("Business Information")} value={selected.info || "—"} />}</>}
 {profileTab !== "Overview" && <ActivityList rows={profileRows.filter((x) => profileTab === "History" || x.group === profileTab)} money={money} tr={tr} onOpen={setDetail} />}
 {"balance" in selected && selected.balance > 0 && <>{paying ? <PaymentForm key={selected.id} kind={kind === "suppliers" ? "supplier" : "customer"} id={selected.id} balance={selected.balance} money={money} tr={tr} onDone={() => setPaying(false)} /> : <ShopButton className="inventory-save mt-2 w-full" onClick={() => setPaying(true)}>{tr(kind === "suppliers" ? "Make payment" : "Receive payment")}</ShopButton>}</>}
 </>}</div></GlassPage>}<>
 <KpiRow><Kpi tone="info" label={tr("Customers")} value={s.customers.length} icon={<Users />} /><Kpi tone="info" label={tr("Suppliers")} value={s.suppliers.length} icon={<Truck />} /><Kpi label={tr("Receivables")} value={money(receivable)} tone="good" icon={<ArrowDownLeft />} /><Kpi label={tr("Payables")} value={money(payable)} tone="bad" icon={<ArrowUpRight />} /></KpiRow>
 {menu === "Overview" ? <><ModuleCharts s={s} module="contacts" money={money} tr={tr} from={per.range.from} to={per.range.to} />{heading("Recent Customers")}{rows(s.customers.slice(-5).reverse(), "Customers")}{heading("Recent Suppliers")}{rows(s.suppliers.slice(-5).reverse(), "Suppliers")}{heading("Outstanding Balances")}{rows(s.customers.filter((x) => x.balance > 0).slice(0, 5), "Customers")}{rows(s.suppliers.filter((x) => x.balance > 0).slice(0, 5), "Suppliers")}</> : sub.startsWith("Add") ? formView : sub === "Categories" ? <>{heading("Categories")}<div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2"><input aria-label="Category name" className="inventory-input" value={category} onChange={(e) => setCategory(e.target.value)} /><ShopButton className="inventory-save px-3" onClick={() => run(() => { addContactCategory(category); setCategory(""); return true; }, tr("Saved"))}>{tr("Add")}</ShopButton></div>{s.contactCategories.map((x) => <AmountRow key={x.id} label={x.name} value={String(s.otherContacts.filter((c) => c.category === x.name).length)} />)}</> : sub === "History" ? <>{heading("History")}{s.audit.filter((x) => x.action.startsWith("CONTACT")).slice(0, 100).map((x) => <div key={x.id} className="money-audit"><span>{dt(x.at)}</span><b>{x.action}</b><span>{x.detail}</span></div>)}</> : <><Search q={q} setQ={setQ} tr={tr} ph={kind === "customers" ? "Search customers..." : kind === "suppliers" ? "Search suppliers..." : "Search contacts..."} />{rows(list.filter((x) => (sub !== "Balances" || ("balance" in x && x.balance > 0)) && `${x.name} ${x.phone}`.toLowerCase().includes(q.toLowerCase())))}{!list.length && <Empty>{tr("No records yet")}</Empty>}</>}
 </>
 {detail && <MoneyDetail row={detail} shop={acct.shopName} money={money} tr={tr} onClose={() => setDetail(null)} />}
 </div></ErpShell>;
}
