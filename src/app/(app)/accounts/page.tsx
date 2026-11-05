import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { getMe, can } from "@/lib/perms";
import { cairoDate } from "@/lib/time";
import Tabs from "./Tabs";

type Row = { day: string; location_id: string; sales: number; cash: number; card: number; invoices: number; expenses: number; purchases: number };
const f = (n: number) => Math.round(n).toLocaleString("en-US");

export default async function Accounts({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const me = await getMe();
  if (!can(me, "acc.view")) redirect("/dashboard");
  const sp = await searchParams;
  const today = cairoDate();
  const to = sp.to || today;
  const from = sp.from || new Date(new Date(to).getTime() - 6 * 864e5).toISOString().slice(0, 10);
  const sb = await supabaseServer();
  const [{ data }, { data: locs }, { data: bal }] = await Promise.all([
    sb.from("daily_summary").select("*").gte("day", from).lte("day", to).order("day", { ascending: false }),
    sb.from("locations").select("id,name"),
    sb.from("supplier_balances").select("balance"),
  ]);
  const R = ((data ?? []) as unknown as Row[]).map((r) => ({ ...r, sales: +r.sales, cash: +r.cash, card: +r.card, expenses: +r.expenses, purchases: +r.purchases }));
  const LN = new Map((locs ?? []).map((l) => [l.id as string, l.name as string]));
  const T = R.reduce((a, r) => ({ s: a.s + r.sales, e: a.e + r.expenses, p: a.p + r.purchases, c: a.c + r.cash, k: a.k + r.card }), { s: 0, e: 0, p: 0, c: 0, k: 0 });
  const owed = (bal ?? []).reduce((a, b) => a + Number(b.balance), 0);
  const days = [...new Set(R.map((r) => r.day))];
  const byLoc = [...new Set(R.map((r) => r.location_id))].map((l) => ({ l, s: R.filter((r) => r.location_id === l).reduce((a, r) => a + r.sales, 0), e: R.filter((r) => r.location_id === l).reduce((a, r) => a + r.expenses, 0) }));
  return (
    <>
      <div className="top"><h1>الحسابات</h1></div>
      <Tabs cur="/accounts" />
      <form className="card row">
        <label className="fld">من<input type="date" name="from" defaultValue={from} /></label>
        <label className="fld">لحد<input type="date" name="to" defaultValue={to} /></label>
        <button className="btn pri">اعرض</button>
      </form>
      <div className="kpis">
        <div className="kpi"><span>المبيعات</span><b className="num">{f(T.s)}</b><small className="num">كاش {f(T.c)} · فيزا {f(T.k)}</small></div>
        <div className="kpi"><span>المصروفات</span><b className="num">{f(T.e)}</b></div>
        <div className="kpi"><span>مشتريات خامات (استلام)</span><b className="num">{f(T.p)}</b></div>
        <div className="kpi"><span>المبيعات − المصروفات − المشتريات</span><b className="num" style={{ color: T.s - T.e - T.p >= 0 ? "var(--good)" : "var(--bad)" }}>{f(T.s - T.e - T.p)}</b><small>تقريبي — من غير تقييم المخزون</small></div>
        <div className="kpi"><span>علينا للموردين</span><b className="num">{f(owed)}</b></div>
      </div>
      <div className="card" style={{ overflowX: "auto" }}>
        <h2>حسب المكان</h2>
        <table><thead><tr><th>المكان</th><th>المبيعات</th><th>المصروفات</th><th>الفرق</th></tr></thead>
          <tbody>{byLoc.map((x) => <tr key={x.l}><td>{LN.get(x.l) ?? x.l}</td><td className="num">{f(x.s)}</td><td className="num">{f(x.e)}</td><td className="num">{f(x.s - x.e)}</td></tr>)}</tbody></table>
      </div>
      <div className="card" style={{ overflowX: "auto" }}>
        <h2>يوم بيوم</h2>
        <table><thead><tr><th>اليوم</th><th>المبيعات</th><th>فواتير</th><th>المصروفات</th><th>المشتريات</th><th>الفرق</th></tr></thead>
          <tbody>{days.map((d) => { const D = R.filter((r) => r.day === d); const s = D.reduce((a, r) => a + r.sales, 0), e = D.reduce((a, r) => a + r.expenses, 0), p = D.reduce((a, r) => a + r.purchases, 0), n = D.reduce((a, r) => a + Number(r.invoices), 0);
            return <tr key={d}><td className="num">{d}</td><td className="num">{f(s)}</td><td className="num">{n}</td><td className="num">{f(e)}</td><td className="num">{f(p)}</td><td className="num">{f(s - e - p)}</td></tr>; })}
            {!days.length && <tr><td colSpan={6} className="muted">مفيش حركة في الفترة دي</td></tr>}</tbody></table>
      </div>
    </>
  );
}
