import Link from "next/link";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { getMe, can } from "@/lib/perms";
import Tabs from "./Tabs";
import NewPo from "./NewPo";
import { cancelPo } from "./actions";

type Po = { id: number; no: number; status: string; expected: string | null; created_at: string; suppliers: { name: string } | { name: string }[] | null; po_lines: { qty: number; price: number; received: number; items: { name: string } | { name: string }[] | null }[] };
type Rc = { id: number; no: number; result: string; at: string; flags: string[]; suppliers: { name: string } | { name: string }[] | null };
const one = <X,>(v: X | X[] | null | undefined): X | null => (Array.isArray(v) ? v[0] ?? null : v ?? null);
const ST: Record<string, string> = { open: "مستني", partial: "وصل جزء", done: "وصل كله", cancelled: "اتلغى" };

export default async function Purchasing() {
  const me = await getMe();
  const canP = can(me, "purchase.edit"), canR = canP || can(me, "stock.edit");
  if (!canR) redirect("/dashboard");
  const sb = await supabaseServer();
  const [{ data: pos }, { data: rcs }, { data: sups }, { data: items }, { data: isup }] = await Promise.all([
    sb.from("purchase_orders").select("id,no,status,expected,created_at,suppliers(name),po_lines(qty,price,received,items(name))").order("id", { ascending: false }).limit(60),
    sb.from("receipts").select("id,no,result,at,flags,suppliers(name)").order("id", { ascending: false }).limit(30),
    sb.from("suppliers").select("id,name").eq("active", true).order("name"),
    sb.from("items").select("id,name,unit,kind").eq("active", true).in("kind", ["raw", "mix", "pack", "semi"]).order("name"),
    sb.from("item_suppliers").select("item_id,supplier_id,price"),
  ]);
  const its = (items ?? []).map((i) => ({ id: Number(i.id), name: i.name as string, unit: i.unit as string, prices: Object.fromEntries((isup ?? []).filter((x) => Number(x.item_id) === Number(i.id) && x.price != null).map((x) => [Number(x.supplier_id), Number(x.price)])) }));
  return (
    <>
      <div className="top"><h1>المشتريات</h1></div>
      <Tabs cur="/purchasing" />
      {canP && <NewPo suppliers={(sups ?? []).map((s) => ({ id: Number(s.id), name: s.name as string }))} items={its} />}
      <div className="card" style={{ overflowX: "auto" }}>
        <h2>أوامر التوريد</h2>
        <table>
          <thead><tr><th>الأمر</th><th>المورد</th><th>الأصناف</th><th>القيمة</th><th>الحالة</th><th></th></tr></thead>
          <tbody>
            {((pos ?? []) as unknown as Po[]).map((p) => (
              <tr key={p.id}>
                <td className="num">PO-{p.no}</td><td>{one(p.suppliers)?.name}</td>
                <td style={{ whiteSpace: "normal" }}>{p.po_lines.map((l, i) => <div key={i} style={{ fontSize: 12.5 }}>{one(l.items)?.name} <span className="num">{l.received > 0 ? `${l.received}/` : ""}{l.qty}</span></div>)}</td>
                <td className="num">{p.po_lines.reduce((a, l) => a + Number(l.qty) * Number(l.price), 0).toLocaleString("en-US")}</td>
                <td>{ST[p.status] ?? p.status}{p.expected ? <div className="muted num" style={{ fontSize: 12 }}>{p.expected}</div> : null}</td>
                <td className="row" style={{ gap: 6, flexWrap: "nowrap" }}>
                  {["open", "partial"].includes(p.status) && <Link className="btn pri" href={`/purchasing/receive/${p.id}`} style={{ display: "inline-grid", placeItems: "center", height: 34 }}>استلم</Link>}
                  {p.status === "open" && canP && <form action={cancelPo}><input type="hidden" name="id" value={p.id} /><button className="btn" style={{ height: 34 }}>إلغاء</button></form>}
                </td>
              </tr>
            ))}
            {!pos?.length && <tr><td colSpan={6} className="muted">لسه مفيش أوامر توريد</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="card" style={{ overflowX: "auto" }}>
        <h2>أذون الاستلام</h2>
        <table>
          <thead><tr><th>الإذن</th><th>المورد</th><th>النتيجة</th><th>ملاحظات</th><th></th></tr></thead>
          <tbody>
            {((rcs ?? []) as unknown as Rc[]).map((r) => (
              <tr key={r.id}><td className="num">GRN-{r.no}</td><td>{one(r.suppliers)?.name}</td><td>{r.result}</td><td style={{ whiteSpace: "normal", fontSize: 12.5, color: r.flags.length ? "var(--bad)" : undefined }}>{r.flags.join(" · ")}</td>
                <td><Link className="btn" href={`/purchasing/receipts/${r.id}`} style={{ display: "inline-grid", placeItems: "center", height: 32 }}>اعرض + ملصقات اللوت</Link></td></tr>
            ))}
            {!rcs?.length && <tr><td colSpan={5} className="muted">لسه مفيش استلام</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
