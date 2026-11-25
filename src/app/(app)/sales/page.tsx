import Link from "next/link";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { getMe, can } from "@/lib/perms";
import { cairoDate, money } from "@/lib/time";

type Line = { line: number; qty: number; total: number; box_sn: number | null; items: { name: string; unit: string } | null };
type Sale = { id: number; no: number; location_id: string; at: string; subtotal: number; discount: number; total: number; paid_cash: number; paid_card: number; change: number; cashier: string;
  paid_credit: number | null; paid_points: number | null; paid_staff: number | null; paid_balance: number | null; voided_at: string | null; void_reason: string | null;
  credit_customer: number | null; points_customer: number | null; balance_customer: number | null; sale_lines: Line[] };
type Ord = { id: number; no: number; location_id: string; delivered_at: string; total: number; pay_method: string; customers: { name: string; phone: string } | null; handled_by: string | null };
type Shift = { id: number; location_id: string; cashier: string; opened_at: string; closed_at: string | null; opening_cash: number; expected_cash: number | null; status: string };
const PAY: Record<string, string> = { cash: "كاش", card: "فيزا", instapay: "إنستاباي", credit: "آجل" };
const hm = (s: string) => new Date(s).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Cairo" });

/** مبيعات فرع في يوم بالتفصيل: فواتير الكاشير + طلبات الأونلاين اللي اتسلّمت في اليوم ده (الطلب بيتحسب يوم ما اتسلّم، مش يوم ما خرج) */
export default async function Sales({ searchParams }: { searchParams: Promise<{ d?: string; loc?: string }> }) {
  const { d = cairoDate(), loc = "" } = await searchParams;
  const me = await getMe();
  if (!can(me, "acc.view") && !can(me, "pos.shift")) redirect("/dashboard");
  const sb = await supabaseServer();
  const from = `${d}T00:00:00+02:00`, to = `${d}T23:59:59.999+02:00`;
  let sq = sb.from("sales").select("id,no,location_id,at,subtotal,discount,total,paid_cash,paid_card,change,cashier,paid_credit,paid_points,paid_staff,paid_balance,voided_at,void_reason,credit_customer,points_customer,balance_customer,sale_lines(line,qty,total,box_sn,items(name,unit))").gte("at", from).lte("at", to).order("at", { ascending: false });
  let oq = sb.from("online_orders").select("id,no,location_id,delivered_at,total,pay_method,handled_by,customers(name,phone)").eq("status", "delivered").gte("delivered_at", from).lte("delivered_at", to).order("delivered_at", { ascending: false });
  let hq = sb.from("shifts").select("id,location_id,cashier,opened_at,closed_at,opening_cash,expected_cash,status").gte("opened_at", from).lte("opened_at", to).order("opened_at");
  if (loc) { sq = sq.eq("location_id", loc); oq = oq.eq("location_id", loc); hq = hq.eq("location_id", loc); }
  const [{ data: sales }, { data: ords }, { data: shifts }, { data: locs }, { data: people }, { data: custs }] = await Promise.all([
    sq, oq, hq,
    sb.from("locations").select("id,name").in("type", ["dark", "shop"]).order("sort"),
    sb.from("profiles").select("id,name"),
    sb.from("customers").select("id,name,company").limit(5000),
  ]);
  const S = (sales ?? []) as unknown as Sale[];
  const live = S.filter((x) => !x.voided_at);
  const O = (ords ?? []) as unknown as Ord[];
  const H = (shifts ?? []) as unknown as Shift[];
  const ln = (id: string) => (locs ?? []).find((l) => l.id === id)?.name ?? id;
  const pn = (id: string | null) => (id ? (people ?? []).find((p) => p.id === id)?.name ?? "—" : "—");
  const cn = (id: number | null) => { const c = (custs ?? []).find((x) => x.id === id); return c ? (c.company as string) || (c.name as string) : null; };
  const posTotal = live.reduce((a, x) => a + Number(x.total), 0), onTotal = O.reduce((a, x) => a + Number(x.total ?? 0), 0);
  const cash = live.reduce((a, x) => a + Number(x.paid_cash) - Number(x.change), 0) + O.filter((o) => o.pay_method === "cash").reduce((a, o) => a + Number(o.total ?? 0), 0);
  const elec = live.reduce((a, x) => a + Number(x.paid_card), 0) + O.filter((o) => ["card", "instapay"].includes(o.pay_method)).reduce((a, o) => a + Number(o.total ?? 0), 0);
  const n = live.length + O.length;
  const payOf = (x: Sale) => [Number(x.paid_cash) - Number(x.change) > 0 && "كاش", Number(x.paid_card) > 0 && "فيزا", Number(x.paid_credit) > 0 && "آجل", Number(x.paid_points) > 0 && "نقاط", Number(x.paid_staff) > 0 && "على حساب موظف", Number(x.paid_balance) > 0 && "رصيد عميل"].filter(Boolean).join(" + ") || "—";
  return (
    <>
      <div className="top"><h1>المبيعات بالتفصيل</h1></div>
      <form className="card row">
        <label className="fld">اليوم<input type="date" name="d" defaultValue={d} /></label>
        <label className="fld">الفرع<select name="loc" defaultValue={loc}><option value="">كل الفروع</option>{(locs ?? []).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></label>
        <button className="btn">اعرض</button>
      </form>
      <div className="kpis">
        <div className="kpi hl"><span>إجمالي المبيعات</span><b className="num">{money(posTotal + onTotal)} ج</b><small>{n} أوردر</small></div>
        <div className="kpi"><span>الكاشير</span><b className="num">{money(posTotal)}</b><small>{live.length} فاتورة</small></div>
        <div className="kpi"><span>الأونلاين (اتسلّم النهارده)</span><b className="num">{money(onTotal)}</b><small>{O.length} طلب</small></div>
        <div className="kpi"><span>كاش</span><b className="num">{money(cash)}</b></div>
        <div className="kpi"><span>إلكتروني</span><b className="num">{money(elec)}</b></div>
        <div className="kpi"><span>متوسط الأوردر</span><b className="num">{n ? money((posTotal + onTotal) / n) : 0}</b></div>
      </div>
      <div className="card" style={{ overflowX: "auto" }}>
        <h2>الورديات اللي اتفتحت اليوم ده</h2>
        <table>
          <thead><tr><th>الفرع</th><th>الكاشير</th><th>فتح</th><th>قفل</th><th>الكاش اللي اتسجّل عهدة</th>{me?.isOwner && <th></th>}</tr></thead>
          <tbody>
            {H.map((h) => (
              <tr key={h.id}>
                <td>{ln(h.location_id)}</td><td>{pn(h.cashier)}</td><td className="num">{hm(h.opened_at)}</td>
                <td className="num">{h.closed_at ? hm(h.closed_at) : <span className="pill">مفتوحة</span>}</td>
                <td className="num">{h.status === "closed" && h.expected_cash != null ? money(Number(h.expected_cash) - Number(h.opening_cash ?? 0)) : "—"}</td>
                {me?.isOwner && <td><Link className="btn" href={`/shifts?id=${h.id}`} style={{ height: 30, display: "inline-grid", placeItems: "center" }}>تقرير الوردية</Link></td>}
              </tr>))}
            {!H.length && <tr><td colSpan={6} className="muted">مفيش ورديات اليوم ده</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="card" style={{ overflowX: "auto" }}>
        <h2>كل الأوردرات</h2>
        <table>
          <thead><tr><th>الرقم</th><th>الوقت</th><th>النوع</th><th>الفرع</th><th>العميل</th><th>التحصيل</th><th>الإجمالي</th></tr></thead>
          <tbody>
            {[...S.map((x) => ({ t: x.at, el: (
              <tr key={`s${x.id}`} style={x.voided_at ? { opacity: 0.55 } : undefined}>
                <td className="num"><details><summary style={{ cursor: "pointer" }}>#{x.no}</summary>
                  <div style={{ minWidth: 260, marginTop: 4 }}>{x.sale_lines.sort((a, b) => a.line - b.line).map((l) => <div key={l.line} className="row" style={{ justifyContent: "space-between", fontSize: 12.5 }}><span>{l.items?.name}{l.box_sn ? ` · #${l.box_sn}` : ""}</span><span>{l.qty} {l.items?.unit} · {money(Number(l.total))}</span></div>)}
                    {Number(x.discount) > 0 && <div style={{ fontSize: 12.5 }}>خصم {money(Number(x.discount))}</div>}<div className="muted" style={{ fontSize: 12 }}>الكاشير: {pn(x.cashier)}</div></div>
                </details>{x.voided_at && <div style={{ color: "var(--bad)", fontSize: 12 }}>⛔ ملغية: {x.void_reason}</div>}</td>
                <td className="num">{hm(x.at)}</td><td>كاشير</td><td>{ln(x.location_id)}</td>
                <td>{cn(x.credit_customer ?? x.points_customer ?? x.balance_customer) ?? <span className="muted">—</span>}</td>
                <td>{payOf(x)}</td><td className="num"><b>{money(Number(x.total))}</b></td>
              </tr>) })),
            ...O.map((o) => ({ t: o.delivered_at, el: (
              <tr key={`o${o.id}`}>
                <td className="num"><Link href={`/orders/${o.id}`}>#{o.no}</Link></td><td className="num">{hm(o.delivered_at)}</td><td>أونلاين</td><td>{ln(o.location_id)}</td>
                <td>{o.customers?.name ?? "—"}</td><td>{PAY[o.pay_method] ?? o.pay_method}</td><td className="num"><b>{money(Number(o.total ?? 0))}</b></td>
              </tr>) }))].sort((a, b) => b.t.localeCompare(a.t)).map((x) => x.el)}
            {!n && !S.length && <tr><td colSpan={7} className="muted">مفيش أوردرات اليوم ده</td></tr>}
          </tbody>
        </table>
        <div className="note" style={{ marginTop: 8 }}>دوس على رقم الفاتورة عشان تشوف أصنافها، وعلى رقم الطلب عشان تفتح صفحته. طلب الأونلاين بيتحسب في اليوم اللي اتسلّم فيه للعميل، حتى لو خرج في وردية اليوم اللي قبله. الفواتير الملغية باينة بس مش محسوبة.</div>
      </div>
    </>
  );
}
