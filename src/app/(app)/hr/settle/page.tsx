import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { getMe, can } from "@/lib/perms";
import { money } from "@/lib/time";
import { calcSettlement, approveSettlement } from "../more-actions";

type S = { id: number; user_id: string; last_day: string; reason: string | null; lines: { kind: string; label: string; amount: number }[]; total: number; status: string; at: string; approved_at: string | null };

/** مخالصة نهاية الخدمة: آخر مرتب + رصيد الإجازات − السلف والعهد والمشتريات الآجل والجزاءات ← الاعتماد بيقفل الحساب */
export default async function Settle({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string; id?: string }> }) {
  const sp = await searchParams;
  const me = await getMe();
  if (!can(me, "hr.settle") && !can(me, "hr.pay")) redirect("/dashboard");
  const sb = await supabaseServer();
  const [{ data: list }, { data: people }] = await Promise.all([
    sb.from("settlements").select("*").neq("status", "cancelled").order("id", { ascending: false }).limit(50),
    sb.from("profiles").select("id,name,active").eq("is_owner", false).order("name"),
  ]);
  const PN = new Map((people ?? []).map((p) => [p.id, p.name]));
  const L = (list ?? []) as S[];
  const cur = L.find((s) => String(s.id) === sp.id);
  return (
    <>
      <div className="top"><h1>مخالصة نهاية الخدمة</h1></div>
      {sp.err && <div className="badmsg">{sp.err}</div>}
      {sp.ok && <div className="okmsg">{sp.ok}</div>}
      {can(me, "hr.settle") && (
        <form action={calcSettlement} className="card row" style={{ alignItems: "end" }}>
          <label className="fld">الموظف<select name="user" required defaultValue=""><option value="" disabled>اختار</option>{(people ?? []).filter((p) => p.active).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
          <label className="fld">آخر يوم شغل<input type="date" name="day" required defaultValue={new Date().toLocaleDateString("sv-SE", { timeZone: "Africa/Cairo" })} /></label>
          <label className="fld" style={{ flex: 1 }}>السبب<input name="reason" placeholder="استقالة / انتهاء عقد / فصل" /></label>
          <button className="btn pri">احسب</button>
        </form>
      )}
      {cur && (
        <div className="card">
          <h2 style={{ marginTop: 0 }}>{PN.get(cur.user_id)} — آخر يوم {cur.last_day}{cur.reason ? ` · ${cur.reason}` : ""}</h2>
          <table><tbody>
            {cur.lines.map((l, i) => <tr key={i}><td>{l.label}</td><td className="num" style={{ color: l.kind === "earn" ? "var(--good)" : "var(--bad)" }}>{l.kind === "earn" ? "+" : "−"} {money(Number(l.amount))} ج</td></tr>)}
            <tr><td><b>{Number(cur.total) >= 0 ? "يستحق الموظف" : "على الموظف"}</b></td><td className="num"><b>{money(Math.abs(Number(cur.total)))} ج</b></td></tr>
          </tbody></table>
          {cur.status === "draft" && can(me, "hr.settle") && (
            <form action={approveSettlement} style={{ marginTop: 10 }}>
              <input type="hidden" name="id" value={cur.id} />
              <button className="btn pri">اعتمد — يقفل حساب الموظف ويشيل صلاحياته</button>
            </form>
          )}
          {cur.status === "approved" && <div className="okmsg" style={{ marginTop: 8 }}>اتعمدت {cur.approved_at?.slice(0, 10)}</div>}
          <div className="note">الأرقام محسوبة من الحضور واللايحة والسلف والعهد والمشتريات. المحاسب يراجع قبل الاعتماد، وأي حاجة ناقصة اتعمل لها تسوية في المرتبات.</div>
        </div>
      )}
      <div className="card" style={{ overflowX: "auto" }}>
        <table>
          <thead><tr><th>الموظف</th><th>آخر يوم</th><th>الصافي</th><th>الحالة</th></tr></thead>
          <tbody>{L.map((s) => <tr key={s.id}><td><a href={`/hr/settle?id=${s.id}`}><b>{PN.get(s.user_id)}</b></a></td><td>{s.last_day}</td><td className="num">{money(Number(s.total))} ج</td><td>{s.status === "draft" ? "مسودة" : "اتعمدت"}</td></tr>)}
            {!L.length && <tr><td colSpan={4} className="muted">مفيش مخالصات</td></tr>}</tbody>
        </table>
      </div>
    </>
  );
}
