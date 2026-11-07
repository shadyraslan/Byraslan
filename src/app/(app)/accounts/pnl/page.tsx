import Link from "next/link";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { getMe, can } from "@/lib/perms";
import { money } from "@/lib/time";
import Bars from "@/components/Bars";

type Ln = { grp: string; line: string; rostos: number; market: number; shared: number; total: number };
type Br = { loc: string; name: string | null; rev: number; cogs: number; loss: number; exp: number; net: number };
type Rep = { direct: { n: number; v: number; avg: number; disc: number }; online: { n: number; v: number; avg: number; cancel: number }; top: { name: string; unit: string; qty: number; v: number }[]; hours: { h: number; n: number; v: number }[]; days: { d: string; v: number }[] };
const G: Record<string, string> = { rev: "الإيرادات", cogs: "تكلفة المبيعات", loss: "الهالك والتبرعات والجرد", exp: "المصروفات والمرتبات" };
const SRC: Record<string, string> = {
  "مبيعات الفروع المباشرة": "فواتير الكاشير", "خصومات الفروع": "خصم الفاتورة متوزّع على أصنافها", "مبيعات الأونلاين": "الطلبات اللي اتسلّمت", "خصومات وعروض الأونلاين": "العروض والبروموكود",
  "إيراد التوصيل": "رسوم التوصيل", "تكلفة المبيعات": "تكلفة الصنف × الكمية", "الهالك": "حركات الهالك بالتكلفة", "التبرعات": "حركات التبرع بالتكلفة", "فروق الجرد": "الجرد المعتمد بالتكلفة", "المرتبات": "كشف المرتبات (إجمالي)",
};
const n = (x: number) => <span style={{ color: x < 0 ? "var(--bad)" : undefined }}>{money(x)}</span>;

/** الأرباح والخسائر لكل ذراع ولكل فرع — وتقرير الفرع لما تختار فرع */
export default async function Pnl({ searchParams }: { searchParams: Promise<{ from?: string; to?: string; loc?: string; m?: string }> }) {
  const sp = await searchParams;
  const me = await getMe();
  if (!can(me, "acc.view") && !can(me, "acc.pnl")) redirect("/dashboard");
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Africa/Cairo" });
  const m = sp.m ?? today.slice(0, 7);
  const from = sp.from || `${m}-01`;
  const to = sp.to || (() => { const d = new Date(`${m}-01T12:00:00`); d.setMonth(d.getMonth() + 1); d.setDate(0); return d.toISOString().slice(0, 10); })();
  const sb = await supabaseServer();
  const [{ data, error }, { data: locs }, rep] = await Promise.all([
    sb.rpc("pnl", { p_from: from, p_to: to, p_loc: sp.loc || null }),
    sb.from("locations").select("id,name,type").eq("active", true).in("type", ["dark", "factory", "warehouse"]).order("sort"),
    sp.loc ? sb.rpc("branch_report", { p_loc: sp.loc, p_from: from, p_to: to }) : Promise.resolve({ data: null }),
  ]);
  const L = ((data as { lines?: Ln[] } | null)?.lines ?? []) as Ln[];
  const B = ((data as { branches?: Br[] } | null)?.branches ?? []) as Br[];
  const R = rep.data as Rep | null;
  const sum = (gs: string[], k: keyof Ln) => L.filter((l) => gs.includes(l.grp)).reduce((a, l) => a + Number(l[k]), 0);
  const Tot = ({ t, gs }: { t: string; gs: string[] }) => (
    <tr style={{ background: "var(--sunk)" }}><td><b>{t}</b></td>{(["rostos", "market", "shared", "total"] as const).map((k) => <td key={k} className="num"><b>{n(sum(gs, k))}</b></td>)}</tr>
  );
  return (
    <>
      <div className="top"><h1>الأرباح والخسائر{sp.loc ? ` — ${(locs ?? []).find((l) => l.id === sp.loc)?.name ?? ""}` : ""}</h1></div>
      <form className="card row" style={{ alignItems: "end" }}>
        <label className="fld">الشهر<input type="month" name="m" defaultValue={m} /></label>
        <label className="fld">أو من<input type="date" name="from" defaultValue={sp.from ?? ""} /></label>
        <label className="fld">لحد<input type="date" name="to" defaultValue={sp.to ?? ""} /></label>
        <label className="fld">الفرع<select name="loc" defaultValue={sp.loc ?? ""}><option value="">كل الشركة</option>{(locs ?? []).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></label>
        <button className="btn pri">اعرض</button>
      </form>
      {error && <div className="badmsg">{error.message}</div>}
      <div className="card" style={{ overflowX: "auto" }}>
        <table>
          <thead><tr><th>البند</th><th>روستوز</th><th>الماركت</th><th>مشتركة</th><th>الإجمالي</th></tr></thead>
          <tbody>
            {(["rev", "cogs", "loss", "exp"] as const).map((g) => {
              const rows = L.filter((l) => l.grp === g && Number(l.total) !== 0);
              return [
                <tr key={g}><td colSpan={5} className="muted" style={{ paddingTop: 10 }}><b>{G[g]}</b></td></tr>,
                ...rows.map((l) => (
                  <tr key={g + l.line}>
                    <td>{l.line}{SRC[l.line] && <div className="muted" style={{ fontSize: 11.5 }}>{SRC[l.line]}</div>}</td>
                    <td className="num">{n(Number(l.rostos))}</td><td className="num">{n(Number(l.market))}</td><td className="num">{n(Number(l.shared))}</td><td className="num"><b>{n(Number(l.total))}</b></td>
                  </tr>
                )),
                g === "rev" ? <Tot key="t1" t="صافي المبيعات" gs={["rev"]} /> : g === "cogs" ? <Tot key="t2" t="مجمل الربح" gs={["rev", "cogs"]} /> : g === "loss" ? <Tot key="t3" t="بعد الهالك والجرد" gs={["rev", "cogs", "loss"]} /> : <Tot key="t4" t="صافي الربح" gs={["rev", "cogs", "loss", "exp"]} />,
              ];
            })}
          </tbody>
        </table>
        <div className="note">المصنع وأقسامه بيتحملوا على روستوز، مصاريف ومرتبات الفرع بتتقسم على الذراعين بنسبة مبيعاته، والإدارة "مشتركة". التكلفة من تكلفة الصنف — حدّثها من الأصناف أو الاستلامات.</div>
      </div>
      {!sp.loc && (
        <div className="card" style={{ overflowX: "auto" }}>
          <h2 style={{ marginTop: 0 }}>حسب الفرع</h2>
          <table>
            <thead><tr><th>الفرع</th><th>صافي المبيعات</th><th>التكلفة</th><th>هالك وجرد</th><th>مصروفات ومرتبات</th><th>الصافي</th></tr></thead>
            <tbody>{B.map((b) => <tr key={b.loc ?? "x"}><td>{b.loc ? <Link href={`/accounts/pnl?m=${m}&loc=${b.loc}`}><b>{b.name ?? b.loc}</b></Link> : <b>الإدارة</b>}</td><td className="num">{n(Number(b.rev))}</td><td className="num">{n(Number(b.cogs))}</td><td className="num">{n(Number(b.loss))}</td><td className="num">{n(Number(b.exp))}</td><td className="num"><b>{n(Number(b.net))}</b></td></tr>)}</tbody>
          </table>
        </div>
      )}
      {R && (
        <>
          <div className="kpis">
            <div className="kpi"><span>فواتير الكاشير</span><b className="num">{R.direct.n}</b><small>{money(R.direct.v)} ج · متوسط {money(R.direct.avg)}</small></div>
            <div className="kpi"><span>طلبات أونلاين اتسلّمت</span><b className="num">{R.online.n}</b><small>{money(R.online.v)} ج · متوسط {money(R.online.avg)}</small></div>
            <div className="kpi"><span>خصومات الكاشير</span><b className="num">{money(R.direct.disc)}</b></div>
            <div className={`kpi${R.online.cancel ? " hl" : ""}`}><span>طلبات اتلغت</span><b className="num">{R.online.cancel}</b></div>
          </div>
          <div className="grid2">
            {!!R.days.length && <div className="card"><h2 style={{ marginTop: 0 }}>مبيعات الكاشير باليوم</h2><Bars data={R.days.map((d) => ({ label: d.d.slice(5), v: Number(d.v) }))} unit=" ج" /></div>}
            {!!R.hours.length && <div className="card"><h2 style={{ marginTop: 0 }}>الزحمة بالساعة</h2><Bars data={R.hours.map((h) => ({ label: `${h.h}`, v: Number(h.n) }))} unit=" فاتورة" /></div>}
          </div>
          <div className="card"><h2 style={{ marginTop: 0 }}>أكتر الأصناف</h2>
            <table><tbody>{R.top.map((t) => <tr key={t.name}><td>{t.name}</td><td className="num">{t.qty} {t.unit}</td><td className="num">{money(t.v)} ج</td></tr>)}</tbody></table>
          </div>
        </>
      )}
    </>
  );
}
