import Link from "next/link";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { getMe, can } from "@/lib/perms";
import Tabs, { Flash } from "../Tabs";
import { decidePermit, grantPermit, saveShifts } from "../pay-actions";

const DN = ["الحد", "الاتنين", "التلات", "الأربع", "الخميس", "الجمعة", "السبت"];
const cairoToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Cairo" }).format(new Date());
const addDays = (s: string, n: number) => { const d = new Date(`${s}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const hm = (t: string | null) => (t ? (t.slice(3, 5) === "00" ? String(Number(t.slice(0, 2))) : `${Number(t.slice(0, 2))}:${t.slice(3, 5)}`) : "");
type Plan = { user_id: string; day: string; start_at: string | null; off: boolean; late_change: boolean };
type Pm = { id: number; user_id: string; day: string; kind: string; at_time: string | null; paid: boolean; reason: string | null; status: string };

export default async function Shifts({ searchParams }: { searchParams: Promise<{ w?: string; ok?: string; err?: string }> }) {
  const sp = await searchParams;
  const me = await getMe();
  if (!me) redirect("/login");
  const sb = await supabaseServer();
  const all = can(me, "hr.shifts");
  const today = cairoToday();
  const w = /^\d{4}-\d{2}-\d{2}$/.test(sp.w ?? "") ? sp.w! : addDays(today, 1);
  const days = Array.from({ length: 7 }, (_, i) => addDays(w, i));
  const [{ data: people }, { data: pays }, { data: plans }, { data: perms }, { data: cfg }] = await Promise.all([
    sb.from("profiles").select("id,name,job,is_test").eq("active", true).order("name"),
    sb.from("employee_pay").select("user_id,manager_id,shift_start,rest_day"),
    sb.from("shift_plans").select("user_id,day,start_at,off,late_change").gte("day", days[0]).lte("day", days[6]),
    sb.from("attendance_permits").select("*").order("id", { ascending: false }).limit(80),
    sb.from("settings").select("value").eq("key", "hr.shifts").maybeSingle(),
  ]);
  const PM = new Map<string, { manager_id: string | null; shift_start: string; rest_day: number }>((pays ?? []).map((p) => [p.user_id as string, p as { manager_id: string | null; shift_start: string; rest_day: number }]));
  const mine = (people ?? []).filter((p) => !p.is_test && (all || PM.get(p.id)?.manager_id === me.id));
  if (!mine.length && !can(me, "hr.view")) redirect("/dashboard");
  const PN = new Map((people ?? []).map((p) => [p.id as string, p.name as string]));
  const P = new Map(((plans ?? []) as Plan[]).map((p) => [`${p.user_id}:${p.day}`, p]));
  const cutoff = String((cfg?.value as { cutoff?: string } | null)?.cutoff ?? "20:00");
  const nowC = new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Cairo", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date());
  const locked = (d: string) => !all && (d <= today || (d === addDays(today, 1) && nowC >= cutoff));
  const P2 = ((perms ?? []) as Pm[]).filter((p) => mine.some((m) => m.id === p.user_id));
  return (
    <>
      <div className="top"><h1>الورديات والأذون</h1></div>
      <Tabs cur="/hr/shifts" />
      <Flash sp={sp} />
      <div className="card row" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <div className="row" style={{ alignItems: "center" }}>
          <Link className="btn" href={`/hr/shifts?w=${addDays(w, -7)}`}>→</Link>
          <b className="num">{days[0]} ← {days[6]}</b>
          <Link className="btn" href={`/hr/shifts?w=${addDays(w, 7)}`}>←</Link>
        </div>
        <span className="muted">اكتب ميعاد البداية بس (9 أو 9:30 أو 2م) أو "راحة". النهاية بعدد ساعات اليوم. وردية اليوم لازم تتحدد قبل الساعة <b>{cutoff}</b> يوم قبلها، وبعدها الموارد البشرية بس.</span>
      </div>
      <form action={saveShifts} className="card" style={{ overflowX: "auto" }}>
        <input type="hidden" name="w" value={w} />
        <table>
          <thead><tr><th>الموظف</th>{days.map((d) => <th key={d}>{DN[new Date(`${d}T12:00:00Z`).getUTCDay()]}<div className="muted num" style={{ fontSize: 11 }}>{d.slice(5)}</div></th>)}</tr></thead>
          <tbody>{mine.map((p) => {
            const pay = PM.get(p.id);
            return (
              <tr key={p.id}>
                <td><b>{p.name}</b><div className="muted" style={{ fontSize: 12 }}>{p.job}</div></td>
                {days.map((d) => {
                  const x = P.get(`${p.id}:${d}`);
                  const def = x ? (x.off ? "راحة" : hm(x.start_at)) : "";
                  const ph = pay && new Date(`${d}T12:00:00Z`).getUTCDay() === pay.rest_day ? "راحة" : hm(pay?.shift_start ?? "09:00:00");
                  return <td key={d}><input name={`s:${p.id}:${d}`} defaultValue={def} placeholder={ph} disabled={locked(d)} style={{ width: 64, height: 34, textAlign: "center", background: x?.late_change ? "#fff4e5" : undefined }} title={x?.late_change ? "اتغيرت بعد الميعاد" : undefined} /></td>;
                })}
              </tr>
            );
          })}</tbody>
        </table>
        {!mine.length && <div className="muted">مفيش موظفين تحت إدارتك — المدير بيتحدد من "بيانات القبض".</div>}
        <div className="row" style={{ marginTop: 10, alignItems: "center" }}><button className="btn pri">احفظ الورديات</button><span className="muted">الخانة الفاضية = الميعاد الثابت (اللي باهت). كل موظف بيوصله إشعار بوردية بكره بعد الساعة {cutoff}، وأي تغيير بعدها بيوصله على طول.</span></div>
      </form>

      <div className="card">
        <h2>إذن انصراف بدري / تأخير</h2>
        <form action={grantPermit} className="row" style={{ alignItems: "end" }}>
          <input type="hidden" name="w" value={w} />
          <label className="fld">الموظف<select name="user" required>{mine.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
          <label className="fld">اليوم<input type="date" name="day" defaultValue={today} required /></label>
          <label className="fld">النوع<select name="kind"><option value="early">انصراف بدري</option><option value="late">تأخير</option></select></label>
          <label className="fld">الساعة<input type="time" name="time" /></label>
          <label className="row" style={{ gap: 6 }}><input type="checkbox" name="paid" defaultChecked style={{ width: 20, height: 20 }} /> مدفوع (من غير خصم)</label>
          <label className="fld" style={{ flex: 1 }}>السبب<input name="reason" /></label>
          <button className="btn pri">سجّل الإذن</button>
        </form>
        <table style={{ marginTop: 10 }}><tbody>{P2.map((x) => (
          <tr key={x.id}>
            <td><b>{PN.get(x.user_id)}</b></td><td className="num">{x.day}</td><td>{x.kind === "early" ? "انصراف بدري" : "تأخير"}{x.at_time ? ` · ${x.at_time.slice(0, 5)}` : ""}</td>
            <td style={{ whiteSpace: "normal" }}>{x.reason}</td>
            <td>{x.status === "pending" ? (
              <form action={decidePermit} className="row" style={{ gap: 4, flexWrap: "nowrap" }}>
                <input type="hidden" name="w" value={w} /><input type="hidden" name="id" value={x.id} />
                <label className="row" style={{ gap: 4 }}><input type="checkbox" name="paid" defaultChecked /> مدفوع</label>
                <button name="ok" value="1" className="btn pri" style={{ height: 30 }}>وافق</button><button name="ok" value="0" className="btn" style={{ height: 30 }}>ارفض</button>
              </form>
            ) : x.status === "approved" ? (x.paid ? "✓ مدفوع" : "✓ بيتخصم وقته") : x.status === "rejected" ? "اترفض" : "اتلغى"}</td>
          </tr>
        ))}</tbody></table>
        {!P2.length && <div className="muted">مفيش أذون</div>}
      </div>
    </>
  );
}
