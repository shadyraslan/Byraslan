import Link from "next/link";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { getMe } from "@/lib/perms";
import Tabs from "../Tabs";

type Sum = { req_days: number; req_hours: number; due_days: number; due_hours: number; present: number; absent: number; worked_hours: number; short_hours: number; left_days: number; left_hours: number; late: number; late_min: number; early: number; early_min: number; ot_hours: number; leave_days: number; holidays: number; gift: number; rest_work: number; permits: number; open_day: boolean };
type Row = { id: string; name: string; job: string | null; loc: string | null; today: string; shift: { off: boolean; start: string | null } | null; sum: Sum; pending: unknown[] };
const cairoMonth = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Cairo", year: "numeric", month: "2-digit" }).format(new Date());
const TD: Record<string, string> = { in: "🟢 جوه", out: "⚪ مشي", none: "—" };

/** إجماليات الساعات والأيام لكل موظف (المدير بيشوف فريقه، والإدارة الكل) */
export default async function Hours({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  const sp = await searchParams;
  const me = await getMe();
  if (!me) redirect("/login");
  const m = /^\d{4}-\d{2}$/.test(sp.m ?? "") ? sp.m! : cairoMonth();
  const sb = await supabaseServer();
  const { data, error } = await sb.rpc("team_summary", { p_month: `${m}-01` });
  const T = ((data as { team: Row[] } | null)?.team ?? []) as Row[];
  const prev = new Date(`${m}-01T12:00:00Z`); prev.setUTCMonth(prev.getUTCMonth() - 1);
  const next = new Date(`${m}-01T12:00:00Z`); next.setUTCMonth(next.getUTCMonth() + 1);
  const tot = T.reduce((a, r) => ({ w: a.w + r.sum.worked_hours, d: a.d + r.sum.due_hours, s: a.s + r.sum.short_hours, o: a.o + r.sum.ot_hours, ab: a.ab + r.sum.absent }), { w: 0, d: 0, s: 0, o: 0, ab: 0 });
  return (
    <>
      <div className="top"><h1>الساعات والأيام</h1></div>
      <Tabs cur="/hr/hours" />
      <div className="card row" style={{ alignItems: "center" }}>
        <Link className="btn" href={`/hr/hours?m=${prev.toISOString().slice(0, 7)}`}>→</Link><b className="num">{m}</b><Link className="btn" href={`/hr/hours?m=${next.toISOString().slice(0, 7)}`}>←</Link>
        <span className="muted">المطلوب لحد النهارده مقابل اللي اتشتغل فعلاً، واللي فاضل في الشهر — بنفس قواعد المرتب (الورديات، الإجازات، الأذون، الإجازات الرسمية).</span>
      </div>
      {error && <div className="badmsg">{error.message}</div>}
      <div className="kpis">
        <div className="kpi"><span>اتشتغل (ساعة)</span><b className="num">{Math.round(tot.w)}</b></div>
        <div className="kpi"><span>المطلوب لحد النهارده</span><b className="num">{Math.round(tot.d)}</b></div>
        <div className="kpi"><span>ناقص</span><b className="num" style={{ color: "var(--bad)" }}>{Math.round(tot.s)}</b></div>
        <div className="kpi"><span>إضافي</span><b className="num">{Math.round(tot.o)}</b></div>
        <div className="kpi"><span>أيام غياب</span><b className="num">{tot.ab}</b></div>
      </div>
      <div className="card" style={{ overflowX: "auto" }}>
        <table>
          <thead><tr><th>الموظف</th><th>النهارده</th><th>أيام حضور</th><th>غياب</th><th>ساعات اتشتغلت</th><th>المطلوب لحد النهارده</th><th>ناقص</th><th>إضافي</th><th>تأخير</th><th>بدري</th><th>إجازات</th><th>أذون</th><th>فاضل في الشهر</th></tr></thead>
          <tbody>{T.map((r) => (
            <tr key={r.id}>
              <td><b>{r.name}</b><div className="muted" style={{ fontSize: 12 }}>{[r.job, r.loc].filter(Boolean).join(" · ")}</div></td>
              <td>{TD[r.today]}{r.shift ? <div className="muted" style={{ fontSize: 12 }}>{r.shift.off ? "راحة" : `من ${r.shift.start?.slice(0, 5)}`}</div> : null}</td>
              <td className="num">{r.sum.present}/{r.sum.due_days}</td>
              <td className="num" style={{ color: r.sum.absent ? "var(--bad)" : undefined }}>{r.sum.absent}</td>
              <td className="num"><b>{r.sum.worked_hours}</b>{r.sum.open_day ? <span className="muted"> +</span> : null}</td>
              <td className="num">{r.sum.due_hours}</td>
              <td className="num" style={{ color: r.sum.short_hours ? "var(--bad)" : undefined }}>{r.sum.short_hours || "—"}</td>
              <td className="num">{r.sum.ot_hours || "—"}</td>
              <td className="num">{r.sum.late ? `${r.sum.late} (${r.sum.late_min}د)` : "—"}</td>
              <td className="num">{r.sum.early ? `${r.sum.early} (${r.sum.early_min}د)` : "—"}</td>
              <td className="num">{r.sum.leave_days + r.sum.gift || "—"}</td>
              <td className="num">{r.sum.permits || "—"}{r.pending.length ? <span style={{ color: "var(--bad)" }}> ({r.pending.length} مستني)</span> : null}</td>
              <td className="num">{r.sum.left_days} يوم · {r.sum.left_hours} س</td>
            </tr>
          ))}</tbody>
        </table>
        {!T.length && <div className="muted">مفيش موظفين تحت إدارتك.</div>}
      </div>
    </>
  );
}
