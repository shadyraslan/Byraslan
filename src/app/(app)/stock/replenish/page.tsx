import Link from "next/link";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { getMe, can } from "@/lib/perms";
import ReqRow from "./ReqRow";
import Rules from "./Rules";

type Rq = { id: number; loc: string; item_id: number; trip_at: string; qty: number; auto_qty: number | null; status: string; edit_note: string | null; note: string | null; loaded_qty: number | null; loaded_at: string | null; calc: { stock?: number; daily?: number; expected?: number; min?: number; boxes?: number; booked?: number } | null; items: { name: string; unit: string } | null; locations: { name: string } | null };
type Cl = { loc: string; loc_name: string; item_id: number; name: string; unit: string; min: number; stock: number; daily: number; transit: number; on_truck: number; earlier: number; booked: number; dep: string; arrive: string; expected: number; trig: boolean; need: number; boxes: number | null };
const ST: Record<string, [string, string]> = { open: ["مفتوح", "#0ea5e9"], approved: ["اتعتمد", "#16a34a"], locked: ["اتقفل — هيتحمّل", "#7c3aed"], loaded: ["اتحمّل", "#16a34a"], missed: ["فات ميعاده", "#dc2626"], cancelled: ["اتلغى", "#737373"] };
const t = (s: string) => new Date(s).toLocaleString("ar-EG", { timeZone: "Africa/Cairo", weekday: "short", hour: "numeric", minute: "2-digit" });
const r3 = (n: number) => Math.round(Number(n) * 1000) / 1000;

/** طلبات الفروع الأوتوماتيك: السيستم بيحسب كل فرع محتاج إيه من المصنع على العربية الجاية */
export default async function Replenish({ searchParams }: { searchParams: Promise<{ t?: string; loc?: string }> }) {
  const sp = await searchParams;
  const me = await getMe();
  if (!["stock.view", "prod.orders", "trips.load", "replenish.manage", "replenish.approve"].some((p) => can(me, p))) redirect("/dashboard");
  const sb = await supabaseServer();
  const tab = sp.t ?? "now";
  const tabs: [string, string][] = [["now", "الطلبات دلوقتي"], ["calc", "الحسبة صنف صنف"], ["past", "اللي فات"], ["rules", "القواعد ومواعيد العربيات"]];
  const { data: cfgRow } = await sb.from("settings").select("value").eq("key", "replenish").maybeSingle();
  const cfg = (cfgRow?.value ?? {}) as { on?: boolean; mode?: string; avg_days?: number; cover_days?: number; safety_pct?: number; cutoff_min?: number; approve?: string };
  const head = (
    <>
      <div className="top"><h1>طلبات الفروع الأوتوماتيك</h1></div>
      <div className="muted" style={{ marginTop: -6, marginBottom: 10 }}>كل ٥ دقايق السيستم بيحسب لكل فرع: الرصيد + اللي في الطريق − البيع المتوقع لحد ما العربية الجاية توصل − الحجوزات. لو أقل من الحد الأدنى بيعمل طلب لوحده على العربية الجاية، والطلب بيدخل خطة الإنتاج وقايمة تحميل العربية.{cfg.on === false && <b style={{ color: "var(--bad)" }}> — متوقف دلوقتي من القواعد.</b>}</div>
      <div className="row" style={{ gap: 6, marginBottom: 10 }}>{tabs.map(([k, l]) => <Link key={k} href={`?t=${k}`} className={tab === k ? "btn pri" : "btn"} style={{ display: "inline-grid", placeItems: "center" }}>{l}</Link>)}</div>
    </>
  );

  if (tab === "rules") {
    const [{ data: lines }, { data: locs }] = await Promise.all([sb.from("branch_lines").select("loc,departs,travel_min,active"), sb.from("locations").select("id,name").in("type", ["dark", "shop"]).eq("active", true).order("sort")]);
    return <>{head}<Rules cfg={cfg} lines={(locs ?? []).map((l) => { const x = (lines ?? []).find((y) => y.loc === l.id); return { loc: l.id, name: l.name, departs: (x?.departs ?? ["08:00"]) as string[], travel_min: x?.travel_min ?? 60, active: x?.active ?? true }; })} canEdit={can(me, "replenish.manage")} /></>;
  }

  if (tab === "calc") {
    const { data } = await sb.rpc("replenish_calc", { p_loc: sp.loc || null });
    const C = (data ?? []) as Cl[];
    return (
      <>
        {head}
        <div className="card" style={{ overflowX: "auto" }}>
          <table>
            <thead><tr><th>الفرع</th><th>الصنف</th><th>الرصيد</th><th>بيع اليوم</th><th>في الطريق</th><th>حجوزات</th><th>العربية الجاية</th><th>المتوقع وقت الوصول</th><th>الحد الأدنى</th><th>هيطلب</th></tr></thead>
            <tbody>{C.map((c) => (
              <tr key={c.loc + c.item_id} style={c.need > 0 ? { background: "color-mix(in srgb, var(--y) 12%, transparent)" } : undefined}>
                <td>{c.loc_name}</td><td><Link href={`/items/${c.item_id}`}><b>{c.name}</b></Link></td>
                <td className="num">{r3(c.stock)}</td><td className="num">{r3(c.daily)}</td><td className="num">{r3(c.transit + Math.max(c.earlier, c.on_truck))}</td><td className="num">{r3(c.booked)}</td>
                <td>{t(c.dep)}</td><td className="num" style={{ color: c.expected < c.min ? "var(--bad)" : undefined, fontWeight: 700 }}>{r3(c.expected)}</td><td className="num">{r3(c.min)}</td>
                <td className="num"><b>{c.need > 0 ? `${r3(c.need)} ${c.unit}` : "—"}</b>{c.boxes ? <div className="muted">≈ {c.boxes} علبة</div> : null}</td>
              </tr>))}
              {!C.length && <tr><td colSpan={10} className="muted">مفيش أصناف ليها حد أدنى في الفروع — حط الحد الأدنى من صفحة الصنف.</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="muted" style={{ fontSize: 12.5 }}>بيع اليوم = متوسط آخر {cfg.avg_days ?? 14} يوم. الطلب = (الحد الأدنى + بيع {cfg.cover_days ?? 1} يوم − المتوقع) + {cfg.safety_pct ?? 0}% أمان. المنتجات بس (السوبر ماركت والخامات من المشتريات).</div>
      </>
    );
  }

  const active = tab === "now";
  let q = sb.from("branch_requests").select("id,loc,item_id,trip_at,qty,auto_qty,status,edit_note,note,loaded_qty,loaded_at,calc,items(name,unit),locations(name)").order("trip_at").order("loc");
  q = active ? q.in("status", ["open", "approved", "locked"]) : q.in("status", ["loaded", "missed", "cancelled"]).gte("updated_at", new Date(Date.now() - 14 * 864e5).toISOString()).limit(500);
  const { data } = await q;
  const R = (data ?? []) as unknown as Rq[];
  const groups = R.reduce<Record<string, Rq[]>>((m, r) => ((m[`${r.locations?.name ?? r.loc} · ${t(r.trip_at)}`] ??= []).push(r), m), {});
  return (
    <>
      {head}
      {Object.entries(groups).map(([g, L]) => (
        <div key={g} className="card">
          <h2>{g} <span className="pill num">{L.length} صنف</span></h2>
          <table>
            <thead><tr><th>الصنف</th><th>المطلوب</th>{active ? <th>الحسبة</th> : <th>اتحمّل</th>}<th>الحالة</th>{active && <th></th>}</tr></thead>
            <tbody>{L.map((r) => (
              <tr key={r.id}>
                <td><b>{r.items?.name}</b>{r.edit_note && <div className="muted" style={{ fontSize: 12 }}>✏️ اتعدّل (كان {r3(r.auto_qty ?? 0)}): {r.edit_note}</div>}{r.note && <div className="muted" style={{ fontSize: 12 }}>{r.note}</div>}</td>
                <td className="num"><b>{r3(r.qty)} {r.items?.unit}</b>{r.calc?.boxes ? <div className="muted">≈ {r.calc.boxes} علبة</div> : null}</td>
                {active ? <td className="muted" style={{ fontSize: 12 }}>رصيد {r3(r.calc?.stock ?? 0)} · بيع اليوم {r3(r.calc?.daily ?? 0)} · متوقع {r3(r.calc?.expected ?? 0)} · حد {r3(r.calc?.min ?? 0)}{r.calc?.booked ? ` · حجوزات ${r3(r.calc.booked)}` : ""}</td>
                  : <td className="num" style={{ color: r.status === "loaded" && Number(r.loaded_qty) < Number(r.qty) * 0.9 ? "var(--bad)" : undefined }}>{r.status === "loaded" ? `${r3(r.loaded_qty ?? 0)} ${r.items?.unit}` : "—"}</td>}
                <td><span className="pill" style={{ background: ST[r.status]?.[1], color: "#fff" }}>{ST[r.status]?.[0] ?? r.status}</span></td>
                {active && <td><ReqRow id={r.id} qty={Number(r.qty)} status={r.status} canEdit={can(me, "replenish.manage")} canApprove={can(me, "replenish.approve") && cfg.approve !== "none" && r.status === "open"} /></td>}
              </tr>))}</tbody>
          </table>
        </div>
      ))}
      {!R.length && <div className="card muted">{active ? "مفيش طلبات مفتوحة دلوقتي — كل الفروع مغطّية لحد العربية الجاية (أو لسه محدش حط حد أدنى)." : "مفيش حاجة في آخر أسبوعين."}</div>}
    </>
  );
}
