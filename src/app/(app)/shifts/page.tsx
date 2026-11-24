import Link from "next/link";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { getMe } from "@/lib/perms";
import { ShiftReportView, type Rep } from "@/components/ShiftReport";

/** تقارير الورديات — للمالك بس: كل وردية بأوردراتها ونوع التحصيل والكاش اللي اتضاف لعهدة الموظف */
export default async function Shifts({ searchParams }: { searchParams: Promise<{ id?: string; loc?: string }> }) {
  const sp = await searchParams;
  const me = await getMe();
  if (!me?.isOwner) redirect("/dashboard");
  const sb = await supabaseServer();
  let q = sb.from("shifts").select("id,location_id,cashier,opened_at,closed_at,status,expected_cash,opening_cash").order("opened_at", { ascending: false }).limit(80);
  if (sp.loc) q = q.eq("location_id", sp.loc);
  const [{ data: shifts }, { data: people }, { data: locs }] = await Promise.all([q, sb.from("profiles").select("id,name"), sb.from("locations").select("id,name").in("type", ["dark", "shop"]).eq("active", true).order("sort")]);
  const P = new Map((people ?? []).map((p) => [p.id as string, p.name as string]));
  const L = new Map((locs ?? []).map((l) => [l.id as string, l.name as string]));
  const id = Number(sp.id || 0) || null;
  const rep = id ? await sb.rpc("shift_report", { p_shift: id }) : null;
  const t = (s: string) => new Date(s).toLocaleString("ar-EG", { dateStyle: "short", timeStyle: "short", timeZone: "Africa/Cairo" });
  return (
    <>
      <div className="top"><h1>تقارير الورديات</h1></div>
      <div className="row" style={{ marginBottom: 10 }}>
        <Link className={`btn${!sp.loc ? " pri" : ""}`} href="/shifts">كل الفروع</Link>
        {(locs ?? []).map((l) => <Link key={l.id} className={`btn${sp.loc === l.id ? " pri" : ""}`} href={`/shifts?loc=${l.id}`}>{l.name}</Link>)}
      </div>
      {rep?.data && <div className="card"><ShiftReportView r={rep.data as Rep} /></div>}
      {rep?.error && <div className="badmsg">{rep.error.message}</div>}
      <div className="card" style={{ overflowX: "auto" }}>
        <table>
          <thead><tr><th>الوردية</th><th>الموظف</th><th>الفرع</th><th>من</th><th>لحد</th><th>الكاش اللي معاه</th><th></th></tr></thead>
          <tbody>{(shifts ?? []).map((s) => (
            <tr key={s.id} style={id === s.id ? { background: "var(--sunk)" } : undefined}>
              <td className="num">#{s.id}</td><td>{P.get(s.cashier as string) ?? "—"}</td><td>{L.get(s.location_id as string) ?? s.location_id}</td>
              <td className="num" style={{ fontSize: 12.5 }}>{t(s.opened_at as string)}</td>
              <td className="num" style={{ fontSize: 12.5 }}>{s.closed_at ? t(s.closed_at as string) : <span className="pill">مفتوحة</span>}</td>
              <td className="num">{s.status === "closed" ? Math.round((Number(s.expected_cash ?? 0) - Number(s.opening_cash ?? 0)) * 100) / 100 : "—"}</td>
              <td><Link className="btn" href={`/shifts?${new URLSearchParams({ ...(sp.loc ? { loc: sp.loc } : {}), id: String(s.id) })}`} style={{ height: 30, display: "inline-grid", placeItems: "center" }}>التقرير</Link></td>
            </tr>))}
          </tbody>
        </table>
      </div>
    </>
  );
}
