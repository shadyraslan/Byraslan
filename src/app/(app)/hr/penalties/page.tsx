import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { getMe, can } from "@/lib/perms";
import { issuePenalty, cancelPenalty, saveRule, savePenaltyCfg } from "../more-actions";

type Rule = { id: number; name: string; steps: { action: string; days?: number }[]; active: boolean; sort: number };
type Pen = { id: number; no: number; user_id: string; rule_id: number; occurrence: number; action: string; days: number; reason: string; day: string; status: string; acked_at: string | null; cancel_note: string | null };
const A: Record<string, string> = { notice: "لفت نظر", warning: "إنذار كتابي", deduct: "خصم" };
const stepTxt = (s: Rule["steps"]) => s.map((x) => (x.action === "deduct" ? `خصم ${x.days}` : A[x.action])).join("، ");

/** الجزاءات حسب اللايحة: المدير أو HR بيسجّل، السيستم بيعرف المرة الكام والجزاء، والموظف بيأكّد الاستلام في تطبيقه */
export default async function Penalties({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string; m?: string; u?: string }> }) {
  const sp = await searchParams;
  const me = await getMe();
  if (!me) redirect("/login");
  const sb = await supabaseServer();
  const m = sp.m ?? new Date().toLocaleDateString("sv-SE", { timeZone: "Africa/Cairo" }).slice(0, 7);
  const [{ data: rules }, { data: pens }, { data: people }, { data: team }, { data: cfg }] = await Promise.all([
    sb.from("penalty_rules").select("*").order("sort"),
    sb.from("penalties").select("*").eq("month", `${m}-01`).order("id", { ascending: false }),
    sb.from("profiles").select("id,name").eq("active", true).eq("is_owner", false).order("name"),
    sb.from("employee_pay").select("user_id").eq("manager_id", me.id),
    sb.from("settings").select("value").eq("key", "hr.penalty").maybeSingle(),
  ]);
  const all = can(me, "hr.penalty");
  const mine = new Set((team ?? []).map((t) => t.user_id));
  const P = (people ?? []).filter((p) => p.id !== me.id && (all || can(me, "hr.shifts") || mine.has(p.id)));
  if (!all && !P.length && !can(me, "hr.pay")) redirect("/dashboard");
  const PN = new Map((people ?? []).map((p) => [p.id, p.name]));
  const R = (rules ?? []) as Rule[];
  const RN = new Map(R.map((r) => [r.id, r.name]));
  const L = ((pens ?? []) as Pen[]).filter((p) => !sp.u || p.user_id === sp.u);
  const c = (cfg?.value ?? {}) as { window_months?: number; max_days_month?: number };
  return (
    <>
      <div className="top"><h1>الجزاءات</h1></div>
      {sp.err && <div className="badmsg">{sp.err}</div>}
      {sp.ok && <div className="okmsg">{sp.ok}</div>}
      {!!P.length && (
        <form action={issuePenalty} className="card" style={{ display: "grid", gap: 8 }}>
          <b>تسجيل جزاء</b>
          <div className="row">
            <label className="fld" style={{ flex: 1 }}>الموظف<select name="user" required defaultValue=""><option value="" disabled>اختار</option>{P.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
            <label className="fld" style={{ flex: 2 }}>المخالفة<select name="rule" required defaultValue=""><option value="" disabled>اختار من اللايحة</option>{R.filter((r) => r.active).map((r) => <option key={r.id} value={r.id}>{r.name} — {stepTxt(r.steps)}</option>)}</select></label>
            <label className="fld">اليوم<input type="date" name="day" required defaultValue={new Date().toLocaleDateString("sv-SE", { timeZone: "Africa/Cairo" })} /></label>
          </div>
          <label className="fld">اللي حصل بالظبط<input name="reason" required placeholder="الوصف اللي هيوصل للموظف" /></label>
          <button className="btn pri" style={{ justifySelf: "start" }}>سجّل — والسيستم يحدد الجزاء حسب المرة</button>
          <div className="muted" style={{ fontSize: 12.5 }}>السيستم بيعدّ المرة الكام في آخر {c.window_months ?? 6} شهور، وأقصى خصم جزاءات {c.max_days_month ?? 5} أيام في الشهر. الخصم بينزل في المرتب لوحده.</div>
        </form>
      )}
      <form className="card row" style={{ alignItems: "end" }}>
        <label className="fld">الشهر<input type="month" name="m" defaultValue={m} /></label>
        <label className="fld">الموظف<select name="u" defaultValue={sp.u ?? ""}><option value="">الكل</option>{(people ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
        <button className="btn">اعرض</button>
      </form>
      <div className="card" style={{ overflowX: "auto" }}>
        <table>
          <thead><tr><th>#</th><th>الموظف</th><th>المخالفة</th><th>المرة</th><th>الجزاء</th><th>اللي حصل</th><th>الموظف أكّد؟</th><th></th></tr></thead>
          <tbody>
            {L.map((p) => (
              <tr key={p.id} style={{ opacity: p.status === "cancelled" ? 0.5 : 1 }}>
                <td>{p.no}</td><td><b>{PN.get(p.user_id)}</b><div className="muted" style={{ fontSize: 12 }}>{p.day}</div></td><td>{RN.get(p.rule_id)}</td><td className="num">{p.occurrence}</td>
                <td>{A[p.action]}{p.action === "deduct" ? ` ${p.days} يوم` : ""}</td><td style={{ fontSize: 13 }}>{p.reason}</td>
                <td>{p.status === "cancelled" ? `اتلغى${p.cancel_note ? `: ${p.cancel_note}` : ""}` : p.acked_at ? "✅ استلم" : "⏳ لسه"}</td>
                <td>{all && p.status !== "cancelled" && <form action={cancelPenalty} className="row" style={{ gap: 4 }}><input type="hidden" name="id" value={p.id} /><input name="note" placeholder="سبب الإلغاء" style={{ width: 120 }} /><button className="btn">إلغاء</button></form>}</td>
              </tr>
            ))}
            {!L.length && <tr><td colSpan={8} className="muted">مفيش جزاءات في الشهر ده</td></tr>}
          </tbody>
        </table>
      </div>
      {(can(me, "settings.edit") || all) && (
        <details className="card">
          <summary><b>لايحة الجزاءات</b> (المحامي يراجعها على قانون العمل)</summary>
          {R.map((r) => (
            <form key={r.id} action={saveRule} className="row" style={{ gap: 6, marginTop: 6 }}>
              <input type="hidden" name="id" value={r.id} />
              <input name="name" defaultValue={r.name} style={{ flex: 2 }} />
              <input name="steps" defaultValue={stepTxt(r.steps)} style={{ flex: 2 }} title="لكل مرة: لفت نظر، إنذار، خصم 0.5…" />
              <input name="sort" defaultValue={r.sort} style={{ width: 50 }} />
              <select name="active" defaultValue={r.active ? "on" : "off"}><option value="on">شغالة</option><option value="off">موقوفة</option></select>
              <button className="btn">حفظ</button>
            </form>
          ))}
          <form action={saveRule} className="row" style={{ gap: 6, marginTop: 10 }}>
            <input name="name" placeholder="مخالفة جديدة" style={{ flex: 2 }} required />
            <input name="steps" placeholder="لفت نظر، إنذار، خصم 1، خصم 2" style={{ flex: 2 }} required />
            <input name="sort" defaultValue={R.length + 1} style={{ width: 50 }} />
            <button className="btn pri">ضيف</button>
          </form>
          {can(me, "settings.edit") && (
            <form action={savePenaltyCfg} className="row" style={{ gap: 6, marginTop: 10, alignItems: "end" }}>
              <label className="fld">المرات بتتعدّ في آخر (شهور)<input name="win" type="number" defaultValue={c.window_months ?? 6} /></label>
              <label className="fld">أقصى خصم جزاءات في الشهر (أيام)<input name="max" type="number" step="0.5" defaultValue={c.max_days_month ?? 5} /></label>
              <button className="btn">حفظ</button>
            </form>
          )}
        </details>
      )}
    </>
  );
}
