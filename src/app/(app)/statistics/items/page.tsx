import Link from "next/link";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { getMe, can } from "@/lib/perms";

type Row = { item_id: number; name: string; arm: string; unit: string; qty: number; sales: number; invs: number; profit: number; pct_sales: number | null; pct_invs: number | null; pct_profit: number | null; margin: number | null };
type Month = { month: string; qty: number; sales: number; profit: number; invs: number; share: number | null };
type SP = { from?: string; to?: string; loc?: string; item?: string; year?: string; sort?: string; arm?: string };

const fmt = (x: number | null | undefined, d = 0) => (x == null ? "—" : Number(x).toLocaleString("en-US", { maximumFractionDigits: d }));
const MON = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
const mName = (m: string) => `${MON[Number(m.slice(5, 7)) - 1]} ${m.slice(2, 4)}`;
const ARM: Record<string, string> = { rostos: "روستوز", market: "سوبر ماركت", oricci: "أوريتشي" };

/** عمود واحد لكل شهر — مقياس واحد، والقيمة بتبان لما تقف على العمود */
function Bars({ title, unit, data, color, fmtD = 0 }: { title: string; unit: string; data: { label: string; v: number }[]; color: string; fmtD?: number }) {
  const W = 560, H = 170, padL = 8, padB = 22, padT = 18;
  const max = Math.max(...data.map((d) => d.v), 0), min = Math.min(...data.map((d) => d.v), 0);
  const span = max - min || 1;
  const bw = (W - padL * 2) / data.length;
  const y = (v: number) => padT + (H - padT - padB) * (1 - (v - min) / span);
  const peak = data.reduce((a, d, i) => (d.v > data[a].v ? i : a), 0);
  return (
    <div style={{ flex: "1 1 320px", minWidth: 0 }}>
      <div style={{ fontWeight: 700, fontSize: 13.5, marginBottom: 4 }}>{title}</div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", direction: "ltr" }} role="img" aria-label={title}>
        <line x1={padL} x2={W - padL} y1={y(0)} y2={y(0)} stroke="var(--line)" strokeWidth={1} />
        {data.map((d, i) => {
          const x = padL + i * bw + 3, h = Math.abs(y(d.v) - y(0));
          return (
            <g key={i}>
              <rect x={padL + i * bw} y={0} width={bw} height={H} fill="transparent"><title>{`${d.label}: ${fmt(d.v, fmtD)} ${unit}`}</title></rect>
              {d.v !== 0 && <rect x={x} y={d.v >= 0 ? y(d.v) : y(0)} width={bw - 6} height={Math.max(h, 1)} rx={4} fill={d.v >= 0 ? color : "var(--bad)"} style={{ pointerEvents: "none" }} />}
              <text x={padL + i * bw + bw / 2} y={H - 6} textAnchor="middle" fontSize={11} fill="var(--muted)" style={{ pointerEvents: "none" }}>{d.label.split(" ")[0].slice(0, 3)}</text>
              {i === peak && d.v > 0 && <text x={padL + i * bw + bw / 2} y={y(d.v) - 5} textAnchor="middle" fontSize={11} fill="var(--ink)" fontWeight={700}>{fmt(d.v, fmtD)}</text>}
            </g>);
        })}
      </svg>
    </div>
  );
}

export default async function ItemStats({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const me = await getMe();
  if (!can(me, "acc.view") && !can(me, "acc.pnl")) redirect("/dashboard");
  const today = new Date(Date.now() + 2 * 3600e3).toISOString().slice(0, 10);
  const from = sp.from || today.slice(0, 8) + "01", to = sp.to || today;
  const loc = sp.loc || null;
  const sb = await supabaseServer();
  const item = Number(sp.item || 0) || null;
  const year = Number(sp.year || 0) || null;
  const [{ data: share, error }, { data: locs }, curve] = await Promise.all([
    sb.rpc("item_share", { p_from: from, p_to: to, p_loc: loc }),
    sb.from("locations").select("id,name").eq("active", true).in("type", ["dark", "shop"]).order("sort"),
    item ? sb.rpc("item_curve", { p_item: item, p_year: year, p_loc: loc }) : Promise.resolve({ data: null }),
  ]);
  const S = (share ?? { total: { sales: 0, invs: 0, profit: 0 }, rows: [] }) as { total: { sales: number; invs: number; profit: number }; rows: Row[] };
  const key = (["sales", "invs", "profit", "qty", "margin"].includes(sp.sort ?? "") ? sp.sort : "sales") as keyof Row;
  const rows = S.rows.filter((r) => !sp.arm || r.arm === sp.arm).sort((a, b) => Number(b[key] ?? 0) - Number(a[key] ?? 0));
  const C = curve.data as { item: { id: number; name: string; unit: string } | null; months: Month[] } | null;
  const q = (p: Partial<SP>) => `/statistics/items?${new URLSearchParams(Object.entries({ ...sp, ...p }).filter(([, v]) => v != null && v !== "") as [string, string][]).toString()}`;
  const th = (k: string, t: string) => <th><Link href={q({ sort: k })} style={{ textDecoration: key === k ? "underline" : "none" }}>{t}{key === k ? " ↓" : ""}</Link></th>;
  const thisYear = Number(today.slice(0, 4));
  return (
    <>
      <div className="crumbs"><Link href="/statistics">التقارير</Link> ‹ <span>الأصناف: النصيب والمنحنى</span></div>
      <div className="top"><h1>نصيب كل صنف ومنحناه على السنة</h1></div>
      <form className="card row" style={{ alignItems: "end" }}>
        <label className="fld">من<input type="date" name="from" defaultValue={from} /></label>
        <label className="fld">لحد<input type="date" name="to" defaultValue={to} /></label>
        <label className="fld">الفرع<select name="loc" defaultValue={loc ?? ""}><option value="">كل الفروع</option>{(locs ?? []).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></label>
        <label className="fld">البراند<select name="arm" defaultValue={sp.arm ?? ""}><option value="">الكل</option>{Object.entries(ARM).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
        {item && <input type="hidden" name="item" value={item} />}
        <button className="btn pri">اعرض</button>
      </form>
      {error && <div className="badmsg">{error.message}</div>}

      {C?.item && (
        <div className="card">
          <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
            <h2 style={{ margin: 0 }}>منحنى {C.item.name} {year ? `— سنة ${year}` : "— آخر 12 شهر"}</h2>
            <div className="row" style={{ gap: 6 }}>
              <Link className={`btn${!year ? " pri" : ""}`} href={q({ year: "" })} style={{ height: 32 }}>آخر 12 شهر</Link>
              {[thisYear, thisYear - 1].map((y) => <Link key={y} className={`btn${year === y ? " pri" : ""}`} href={q({ year: String(y) })} style={{ height: 32 }}>{y}</Link>)}
              <Link className="btn" href={q({ item: "", year: "" })} style={{ height: 32 }}>×</Link>
            </div>
          </div>
          <div className="row" style={{ gap: 18, marginTop: 8, alignItems: "flex-start" }}>
            <Bars title="المبيعات (ج)" unit="ج" color="#0ea5e9" data={C.months.map((m) => ({ label: mName(m.month), v: m.sales }))} />
            <Bars title={`الكمية (${C.item.unit})`} unit={C.item.unit} color="#0ea5e9" fmtD={1} data={C.months.map((m) => ({ label: mName(m.month), v: m.qty }))} />
            <Bars title="الربح (ج)" unit="ج" color="#16a34a" data={C.months.map((m) => ({ label: mName(m.month), v: m.profit }))} />
          </div>
          <div style={{ overflowX: "auto", marginTop: 8 }}>
            <table>
              <thead><tr><th>الشهر</th><th>الكمية</th><th>المبيعات</th><th>الربح</th><th>الفواتير</th><th>نصيبه من مبيعات الشهر</th></tr></thead>
              <tbody>{C.months.map((m) => <tr key={m.month}><td>{mName(m.month)}</td><td className="num">{fmt(m.qty, 2)}</td><td className="num">{fmt(m.sales)}</td><td className="num">{fmt(m.profit)}</td><td className="num">{fmt(m.invs)}</td><td className="num">{m.share == null ? "—" : `${m.share}%`}</td></tr>)}</tbody>
            </table>
          </div>
        </div>
      )}

      <div className="card" style={{ overflowX: "auto" }}>
        <div className="row" style={{ gap: 18, marginBottom: 8 }}>
          <div><div className="muted" style={{ fontSize: 12 }}>المبيعات (صافي بعد الخصم)</div><b className="num" style={{ fontSize: 20 }}>{fmt(S.total.sales)} ج</b></div>
          <div><div className="muted" style={{ fontSize: 12 }}>عدد الفواتير</div><b className="num" style={{ fontSize: 20 }}>{fmt(S.total.invs)}</b></div>
          <div><div className="muted" style={{ fontSize: 12 }}>الربح (المبيعات − التكلفة)</div><b className="num" style={{ fontSize: 20 }}>{fmt(S.total.profit)} ج</b></div>
        </div>
        <table>
          <thead><tr><th>الصنف</th>{th("qty", "الكمية")}{th("sales", "المبيعات")}<th>% من المبيعات</th>{th("invs", "في كام فاتورة")}<th>% من الفواتير</th>{th("profit", "الربح")}<th>% من الربح</th>{th("margin", "هامش")}<th></th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.item_id} style={item === r.item_id ? { background: "var(--sunk)" } : undefined}>
                <td>{r.name}<div className="muted" style={{ fontSize: 11.5 }}>{ARM[r.arm] ?? r.arm}</div></td>
                <td className="num">{fmt(r.qty, 2)} {r.unit}</td>
                <td className="num">{fmt(r.sales)}</td>
                <td className="num"><Share v={r.pct_sales} /></td>
                <td className="num">{fmt(r.invs)}</td>
                <td className="num"><Share v={r.pct_invs} /></td>
                <td className="num" style={{ color: r.profit < 0 ? "var(--bad)" : undefined }}>{fmt(r.profit)}</td>
                <td className="num"><Share v={r.pct_profit} /></td>
                <td className="num">{r.margin == null ? "—" : `${r.margin}%`}</td>
                <td><Link className="btn" href={q({ item: String(r.item_id) })} style={{ height: 30, display: "inline-grid", placeItems: "center" }}>المنحنى</Link></td>
              </tr>))}
            {!rows.length && <tr><td colSpan={10} className="muted">مفيش مبيعات في الفترة دي</td></tr>}
          </tbody>
        </table>
        <div className="note" style={{ marginTop: 8 }}>المبيعات = الكاشير + الأونلاين اللي اتسلّم، بعد توزيع الخصم على السطور، ومن غير الفواتير الملغية. «% من الفواتير» = في كام فاتورة من كل 100 الصنف ده كان موجود. التكلفة = سعر آخر استلام قبل البيع، ولو مفيش = تكلفة الصنف المسجلة.</div>
      </div>
    </>
  );
}

function Share({ v }: { v: number | null }) {
  if (v == null) return <>—</>;
  const w = Math.max(0, Math.min(100, v));
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <span style={{ display: "inline-block", width: 54, height: 6, borderRadius: 3, background: "var(--sunk)", overflow: "hidden" }}><span style={{ display: "block", width: `${w}%`, height: "100%", background: "#0ea5e9", borderRadius: 3 }} /></span>
      {v}%
    </span>
  );
}
