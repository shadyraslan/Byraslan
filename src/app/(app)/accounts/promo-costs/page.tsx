import Link from "next/link";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { getMe, can } from "@/lib/perms";
import { money } from "@/lib/time";
import Export from "../../users/report/Export";

type Row = { period: string; cat: string; value: number; cost: number; n: number };
type Sub = { cat: string; sub: string; value: number; n: number };
type Lc = { loc: string; name: string | null; value: number };
const CAT: [string, string, string][] = [
  ["offers", "🏷️ العروض والأكواد", "كل عرض بيتسجّل باسمه"],
  ["manual", "✂️ خصم يدوي في الكاشير", "الخصم اللي مش من عرض"],
  ["staff", "👤 خصم الموظفين", "فواتير على حساب موظف"],
  ["branch", "🏪 خصم الفرع على الطلبات", "وقت التسليم"],
  ["online_other", "📱 خصومات أونلاين تانية", "خصم الطلب اللي مش عرض ولا نقاط"],
  ["free_fee", "🛵 توصيل ببلاش", "رسوم توصيل اتلغت"],
  ["points", "⭐ النقاط", "اللي اتدفع بالنقاط"],
  ["gift", "🎁 الهدايا", "بسعر البيع (التكلفة جنبها)"],
  ["comp_items", "🔁 تعويض أصناف", "بسعر البيع (التكلفة جنبها)"],
  ["comp_money", "💵 تعويض فلوس", "رصيد أو كاش أو تحويل"],
];
const L = Object.fromEntries(CAT.map(([k, l]) => [k, l]));
const BY: [string, string][] = [["day", "يومي"], ["month", "شهري"], ["year", "سنوي"]];

/** كل اللي بيتصرف على العملاء: عروض، خصومات، نقاط، توصيل ببلاش، هدايا، تعويضات — يومي / شهري / سنوي */
export default async function PromoCosts({ searchParams }: { searchParams: Promise<{ from?: string; to?: string; loc?: string; by?: string }> }) {
  const sp = await searchParams;
  const me = await getMe();
  if (!can(me, "acc.view") && !can(me, "acc.pnl")) redirect("/dashboard");
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Africa/Cairo" });
  const by = sp.by ?? "month";
  const from = sp.from || (by === "year" ? `${today.slice(0, 4)}-01-01` : by === "day" ? `${today.slice(0, 7)}-01` : `${today.slice(0, 4)}-01-01`);
  const to = sp.to || today;
  const sb = await supabaseServer();
  const [{ data, error }, { data: locs }] = await Promise.all([
    sb.rpc("promo_costs", { p_from: from, p_to: to, p_loc: sp.loc || null, p_by: by }),
    sb.from("locations").select("id,name").eq("active", true).in("type", ["dark", "shop", "factory"]).order("sort"),
  ]);
  const d = (data ?? { rows: [], subs: [], locs: [] }) as { rows: Row[]; subs: Sub[]; locs: Lc[] };
  const periods = [...new Set(d.rows.map((r) => r.period))].sort().reverse();
  const cats = CAT.filter(([k]) => d.rows.some((r) => r.cat === k));
  const cell = (p: string, c: string) => d.rows.find((r) => r.period === p && r.cat === c);
  const catTot = (c: string) => d.rows.filter((r) => r.cat === c).reduce((a, r) => a + Number(r.value), 0);
  const catCost = (c: string) => d.rows.filter((r) => r.cat === c).reduce((a, r) => a + Number(r.cost), 0);
  const catN = (c: string) => d.rows.filter((r) => r.cat === c).reduce((a, r) => a + r.n, 0);
  const total = d.rows.reduce((a, r) => a + Number(r.value), 0);
  const q = (o: Record<string, string>) => "?" + new URLSearchParams({ from, to, by, ...(sp.loc ? { loc: sp.loc } : {}), ...o }).toString();
  return (
    <>
      <div className="top"><h1>مصروفات العروض والهدايا والتعويضات</h1></div>
      <style>{`.pc-cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px;margin-bottom:12px}.pc-card{border:1px solid var(--line);border-radius:14px;padding:12px;background:var(--panel)}.pc-card b{display:block;font-size:20px}.pc-wrap{overflow-x:auto}.pc-wrap table{min-width:560px}`}</style>
      <form className="card row">
        <input type="hidden" name="by" value={by} />
        <label className="fld">من<input type="date" name="from" defaultValue={from} /></label>
        <label className="fld">لحد<input type="date" name="to" defaultValue={to} /></label>
        <label className="fld">الفرع<select name="loc" defaultValue={sp.loc ?? ""}><option value="">كل الفروع</option>{(locs ?? []).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></label>
        <button className="btn pri">اعرض</button>
        <span className="row" style={{ gap: 6, marginInlineStart: "auto" }}>{BY.map(([k, l]) => <Link key={k} href={q({ by: k })} className={by === k ? "btn pri" : "btn"} style={{ display: "inline-grid", placeItems: "center" }}>{l}</Link>)}</span>
      </form>
      {error && <div className="badmsg">{error.message}</div>}
      <div className="pc-cards">
        <div className="pc-card" style={{ borderColor: "var(--bad)" }}><div className="muted">الإجمالي</div><b className="num">{money(total)} ج</b><div className="muted">{from} ← {to}</div></div>
        {cats.map(([k, l, h]) => (
          <div key={k} className="pc-card"><div className="muted">{l}</div><b className="num">{money(catTot(k))} ج</b>
            <div className="muted" style={{ fontSize: 12 }}>{catN(k)} مرة{["gift", "comp_items"].includes(k) ? ` · تكلفتها ${money(catCost(k))} ج` : ""} · {h}</div></div>
        ))}
      </div>
      {!cats.length && <div className="card muted">مفيش عروض ولا خصومات ولا هدايا ولا تعويضات في الفترة دي.</div>}
      {cats.length > 0 && (
        <div className="card">
          <div className="row" style={{ justifyContent: "space-between" }}><h2>{by === "day" ? "يوم بيوم" : by === "year" ? "سنة بسنة" : "شهر بشهر"}</h2>
            <Export file="مصروفات-العروض-والتعويضات" rows={periods.map((p) => ({ الفترة: p, ...Object.fromEntries(cats.map(([k, l]) => [l, Number(cell(p, k)?.value ?? 0)])), الإجمالي: d.rows.filter((r) => r.period === p).reduce((a, r) => a + Number(r.value), 0) }))} /></div>
          <div className="pc-wrap"><table>
            <thead><tr><th>الفترة</th>{cats.map(([k, l]) => <th key={k}>{l}</th>)}<th>الإجمالي</th></tr></thead>
            <tbody>{periods.map((p) => (
              <tr key={p}><td className="num"><b>{p}</b></td>{cats.map(([k]) => <td key={k} className="num">{cell(p, k) ? money(Number(cell(p, k)!.value)) : "—"}</td>)}
                <td className="num"><b>{money(d.rows.filter((r) => r.period === p).reduce((a, r) => a + Number(r.value), 0))}</b></td></tr>
            ))}</tbody>
          </table></div>
        </div>
      )}
      {d.subs.some((s) => s.sub) && (
        <div className="card">
          <h2>التفاصيل</h2>
          <table><thead><tr><th>النوع</th><th>التفصيل</th><th>مرات</th><th>القيمة</th></tr></thead>
            <tbody>{d.subs.filter((s) => s.sub).map((s, i) => <tr key={i}><td>{L[s.cat] ?? s.cat}</td><td>{s.sub}</td><td className="num">{s.n}</td><td className="num">{money(Number(s.value))}</td></tr>)}</tbody></table>
        </div>
      )}
      {!sp.loc && d.locs.length > 1 && (
        <div className="card"><h2>حسب الفرع</h2>
          <table><tbody>{d.locs.map((l) => <tr key={l.loc}><td>{l.name ?? l.loc}</td><td className="num">{money(Number(l.value))} ج</td><td className="num muted">{total ? Math.round((Number(l.value) / total) * 100) : 0}%</td></tr>)}</tbody></table>
        </div>
      )}
      <div className="muted" style={{ fontSize: 12.5 }}>الأرقام دي بسعر البيع (اللي العميل كسبه). في الأرباح والخسائر الخصومات والنقاط بتقلّل الإيراد، والهدايا وتعويض الأصناف بتتحسب بالتكلفة.</div>
    </>
  );
}
