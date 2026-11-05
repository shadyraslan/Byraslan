import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { getMe, can } from "@/lib/perms";
import { cairoDate, money } from "@/lib/time";

type Sale = { id: number; no: number; location_id: string; at: string; subtotal: number; discount: number; total: number; paid_cash: number; paid_card: number; change: number; cashier: string };
type Shift = { id: number; location_id: string; cashier: string; opened_at: string; closed_at: string | null; opening_cash: number; counted_cash: number | null; expected_cash: number | null; status: string };

export default async function Sales({ searchParams }: { searchParams: Promise<{ d?: string; loc?: string }> }) {
  const { d = cairoDate(), loc = "" } = await searchParams;
  const me = await getMe();
  if (!can(me, "acc.view") && !can(me, "pos.shift")) redirect("/dashboard");
  const sb = await supabaseServer();
  const from = `${d}T00:00:00+02:00`, to = `${d}T23:59:59.999+02:00`;
  let sq = sb.from("sales").select("id,no,location_id,at,subtotal,discount,total,paid_cash,paid_card,change,cashier").gte("at", from).lte("at", to).order("at", { ascending: false });
  if (loc) sq = sq.eq("location_id", loc);
  let hq = sb.from("shifts").select("id,location_id,cashier,opened_at,closed_at,opening_cash,counted_cash,expected_cash,status").gte("opened_at", from).lte("opened_at", to).order("opened_at");
  if (loc) hq = hq.eq("location_id", loc);
  const [{ data: sales }, { data: shifts }, { data: locs }, { data: people }] = await Promise.all([
    sq, hq,
    sb.from("locations").select("id,name").in("type", ["dark", "shop"]).order("sort"),
    sb.from("profiles").select("id,name"),
  ]);
  const S = (sales ?? []) as unknown as Sale[];
  const H = (shifts ?? []) as unknown as Shift[];
  const ln = (id: string) => (locs ?? []).find((l) => l.id === id)?.name ?? id;
  const pn = (id: string) => (people ?? []).find((p) => p.id === id)?.name ?? "—";
  const sum = (k: keyof Sale) => S.reduce((a, x) => a + Number(x[k]), 0);
  const cash = S.reduce((a, x) => a + Number(x.paid_cash) - Number(x.change), 0);
  return (
    <>
      <div className="top"><h1>المبيعات والورديات</h1></div>
      <form className="card row">
        <label className="fld">اليوم<input type="date" name="d" defaultValue={d} /></label>
        <label className="fld">الفرع<select name="loc" defaultValue={loc}><option value="">كل الفروع</option>{(locs ?? []).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></label>
        <button className="btn">اعرض</button>
      </form>
      <div className="kpis">
        <div className="kpi hl"><span>الإجمالي</span><b className="num">{money(sum("total"))} ج</b><small>{S.length} فاتورة</small></div>
        <div className="kpi"><span>كاش (صافي)</span><b className="num">{money(cash)}</b></div>
        <div className="kpi"><span>فيزا</span><b className="num">{money(sum("paid_card"))}</b></div>
        <div className="kpi"><span>خصومات</span><b className="num">{money(sum("discount"))}</b></div>
        <div className="kpi"><span>متوسط الفاتورة</span><b className="num">{S.length ? money(sum("total") / S.length) : 0}</b></div>
      </div>
      <div className="card" style={{ overflowX: "auto" }}>
        <h2>الورديات</h2>
        <table>
          <thead><tr><th>الفرع</th><th>الكاشير</th><th>فتح</th><th>قفل</th><th>المفروض في الدرج</th><th>اتعد</th><th>الفرق</th></tr></thead>
          <tbody>
            {H.map((h) => {
              const diff = h.counted_cash != null && h.expected_cash != null ? Number(h.counted_cash) - Number(h.expected_cash) : null;
              return (
                <tr key={h.id}>
                  <td>{ln(h.location_id)}</td><td>{pn(h.cashier)}</td>
                  <td className="num">{new Date(h.opened_at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Cairo" })}</td>
                  <td className="num">{h.closed_at ? new Date(h.closed_at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Cairo" }) : <span className="pill">مفتوحة</span>}</td>
                  <td className="num">{h.expected_cash != null ? money(Number(h.expected_cash)) : "—"}</td>
                  <td className="num">{h.counted_cash != null ? money(Number(h.counted_cash)) : "—"}</td>
                  <td className="num" style={{ color: diff == null || diff === 0 ? undefined : diff > 0 ? "var(--good)" : "var(--bad)", fontWeight: 700 }}>{diff == null ? "—" : diff === 0 ? "مظبوط" : `${diff > 0 ? "+" : ""}${diff.toFixed(2)}`}</td>
                </tr>
              );
            })}
            {!H.length && <tr><td colSpan={7} className="muted">مفيش ورديات اليوم ده</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="card" style={{ overflowX: "auto" }}>
        <h2>الفواتير</h2>
        <table>
          <thead><tr><th>رقم</th><th>الوقت</th><th>الفرع</th><th>الكاشير</th><th>الإجمالي</th><th>كاش</th><th>فيزا</th><th>خصم</th></tr></thead>
          <tbody>
            {S.map((x) => (
              <tr key={x.id}>
                <td className="num">#{x.no}</td>
                <td className="num">{new Date(x.at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Cairo" })}</td>
                <td>{ln(x.location_id)}</td><td>{pn(x.cashier)}</td>
                <td className="num"><b>{Number(x.total).toFixed(2)}</b></td>
                <td className="num">{(Number(x.paid_cash) - Number(x.change)).toFixed(2)}</td>
                <td className="num">{Number(x.paid_card).toFixed(2)}</td>
                <td className="num">{Number(x.discount) ? Number(x.discount).toFixed(2) : "—"}</td>
              </tr>
            ))}
            {!S.length && <tr><td colSpan={8} className="muted">مفيش فواتير اليوم ده</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
