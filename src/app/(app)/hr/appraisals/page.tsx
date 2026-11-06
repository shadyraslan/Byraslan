import Link from "next/link";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { getMe, can } from "@/lib/perms";
import Tabs, { Flash } from "../Tabs";
import { decideAppraisal, saveAppraisal, saveAppraisalRules, saveTemplate } from "../pay-actions";

type Item = { name: string; weight: number; target: number; unit?: string; lower?: boolean; actual?: number | null; note?: string; pct?: number | null };
type A = { id: number; user_id: string; month: string; items: Item[]; score: number | null; grade: string | null; bonus_pct: number | null; bonus: number | null; status: string; mgr_comment: string | null; emp_comment: string | null; ack_at: string | null; by: string | null };
const ST: Record<string, string> = { draft: "مسودة", submitted: "مستني الاعتماد", approved: "اتعتمد ✅", returned: "رجع للتعديل" };
const cairoMonth = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Cairo", year: "numeric", month: "2-digit" }).format(new Date());

export default async function Appraisals({ searchParams }: { searchParams: Promise<{ m?: string; ok?: string; err?: string }> }) {
  const sp = await searchParams;
  const me = await getMe();
  if (!me) redirect("/login");
  const m = /^\d{4}-\d{2}$/.test(sp.m ?? "") ? sp.m! : cairoMonth();
  const sb = await supabaseServer();
  const approver = can(me, "hr.appraise");
  const [{ data: people }, { data: pays }, { data: apps }, { data: tpls }, { data: cfg }] = await Promise.all([
    sb.from("profiles").select("id,name,job,is_test").eq("active", true).order("name"),
    sb.from("employee_pay").select("user_id,manager_id,base"),
    sb.from("appraisals").select("*").eq("month", `${m}-01`),
    sb.from("kpi_templates").select("*"),
    sb.from("settings").select("value").eq("key", "hr.appraisal").maybeSingle(),
  ]);
  const PM = new Map<string, { manager_id: string | null; base: number }>((pays ?? []).map((p) => [p.user_id as string, p as { manager_id: string | null; base: number }]));
  const team = (people ?? []).filter((p) => !p.is_test && p.id !== me.id && (approver || can(me, "hr.shifts") || PM.get(p.id)?.manager_id === me.id));
  if (!team.length && !approver) redirect("/dashboard");
  const PN = new Map((people ?? []).map((p) => [p.id as string, p.name as string]));
  const AM = new Map(((apps ?? []) as A[]).map((a) => [a.user_id, a]));
  const TM = new Map<string, Item[]>((tpls ?? []).map((t) => [t.job as string, (t.items ?? []) as Item[]]));
  const jobs: string[] = [...new Set<string>((people ?? []).filter((p) => !p.is_test).map((p) => (p.job as string) || "").filter(Boolean))];
  const g = (cfg?.value ?? {}) as { cap?: number; grades?: { min: number; name: string; bonus_pct: number }[] };
  const pending = ((apps ?? []) as A[]).filter((a) => a.status === "submitted");
  const prev = new Date(`${m}-01T12:00:00Z`); prev.setUTCMonth(prev.getUTCMonth() - 1);
  const next = new Date(`${m}-01T12:00:00Z`); next.setUTCMonth(next.getUTCMonth() + 1);
  return (
    <>
      <div className="top"><h1>تقييم الأداء</h1></div>
      <Tabs cur="/hr/appraisals" />
      <Flash sp={sp} />
      <div className="card row" style={{ alignItems: "center" }}>
        <Link className="btn" href={`/hr/appraisals?m=${prev.toISOString().slice(0, 7)}`}>→</Link><b className="num">{m}</b><Link className="btn" href={`/hr/appraisals?m=${next.toISOString().slice(0, 7)}`}>←</Link>
        <span className="muted">النتيجة = متوسط (المحقق ÷ الهدف) بالأوزان، وأقصى حاجة لكل مؤشر {g.cap ?? 120}%. المؤشر اللي "أقل أحسن" (زي الهالك والشكاوى) بيتحسب بالعكس.</span>
      </div>

      {approver && !!pending.length && (
        <div className="card" style={{ overflowX: "auto" }}>
          <h2>مستني الاعتماد ({pending.length})</h2>
          <table><tbody>{pending.map((a) => (
            <tr key={a.id}>
              <td><b>{PN.get(a.user_id)}</b><div className="muted">قيّمه: {PN.get(a.by ?? "")}</div></td>
              <td className="num"><b>{a.score}%</b> — {a.grade}{a.bonus_pct ? ` · مكافأة ${a.bonus_pct}% = ${Math.round((Number(PM.get(a.user_id)?.base) || 0) * Number(a.bonus_pct) / 100)} ج` : ""}</td>
              <td style={{ whiteSpace: "normal", maxWidth: 300 }}>{a.items.map((i) => `${i.name}: ${i.actual ?? "—"}/${i.target}${i.unit ? ` ${i.unit}` : ""} (${i.pct ?? "—"}%)`).join(" · ")}{a.mgr_comment ? <div className="muted">{a.mgr_comment}</div> : null}</td>
              <td><form action={decideAppraisal} className="row" style={{ gap: 4, flexWrap: "nowrap" }}><input type="hidden" name="m" value={m} /><input type="hidden" name="id" value={a.id} />
                <input name="note" placeholder="ملاحظة للرجوع" style={{ width: 120, height: 32 }} />
                <button name="ok" value="1" className="btn pri" style={{ height: 32 }}>اعتمد</button><button name="ok" value="0" className="btn" style={{ height: 32 }}>رجّعه</button></form></td>
            </tr>
          ))}</tbody></table>
        </div>
      )}

      <div className="card">
        <h2>التقييمات ({team.length})</h2>
        {team.map((p) => {
          const a = AM.get(p.id);
          const items: Item[] = a?.items?.length ? a.items : (TM.get(p.job ?? "") ?? []);
          const rows = items.length ? items : [{ name: "", weight: 1, target: 0 }];
          const editable = !a || a.status === "draft" || a.status === "returned" || (approver && a.status === "submitted");
          return (
            <details key={p.id} style={{ borderTop: "1px solid var(--line, #eee)", padding: "8px 0" }}>
              <summary className="row" style={{ justifyContent: "space-between", cursor: "pointer" }}>
                <span><b>{p.name}</b> <span className="muted">{p.job}</span></span>
                <span>{a ? <>{ST[a.status]}{a.score != null ? <b className="num"> · {a.score}% {a.grade}</b> : null}{a.status === "approved" ? (a.ack_at ? " · الموظف شافه ✓" : " · لسه ماشافوش") : null}</> : <span className="muted">لسه</span>}</span>
              </summary>
              {a?.emp_comment && <div className="muted">تعليق الموظف: {a.emp_comment}</div>}
              {!TM.get(p.job ?? "") && !a && <div className="muted">مفيش مؤشرات متسجّلة لوظيفة "{p.job || "—"}" — ضيفها تحت أو اكتبها هنا.</div>}
              <form action={saveAppraisal}>
                <input type="hidden" name="m" value={m} /><input type="hidden" name="user" value={p.id} /><input type="hidden" name="n" value={rows.length + 1} />
                <table style={{ marginTop: 6 }}>
                  <thead><tr><th>المؤشر</th><th>الوزن</th><th>الهدف</th><th>الوحدة</th><th>أقل أحسن؟</th><th>المحقق</th><th>ملاحظة</th><th>%</th></tr></thead>
                  <tbody>{[...rows, { name: "", weight: 1, target: 0 } as Item].map((i, k) => (
                    <tr key={k}>
                      <td><input name={`name${k}`} defaultValue={i.name} disabled={!editable} placeholder={k === rows.length ? "+ مؤشر" : ""} style={{ width: 170 }} /></td>
                      <td><input name={`w${k}`} defaultValue={i.weight} disabled={!editable} dir="ltr" style={{ width: 50 }} /></td>
                      <td><input name={`t${k}`} defaultValue={i.target || ""} disabled={!editable} dir="ltr" style={{ width: 70 }} /></td>
                      <td><input name={`u${k}`} defaultValue={i.unit ?? ""} disabled={!editable} style={{ width: 70 }} /></td>
                      <td><select name={`l${k}`} defaultValue={i.lower ? "1" : "0"} disabled={!editable}><option value="0">لا</option><option value="1">أيوه</option></select></td>
                      <td><input name={`a${k}`} defaultValue={i.actual ?? ""} disabled={!editable} dir="ltr" style={{ width: 70 }} /></td>
                      <td><input name={`note${k}`} defaultValue={i.note ?? ""} disabled={!editable} style={{ width: 140 }} /></td>
                      <td className="num">{i.pct ?? ""}</td>
                    </tr>
                  ))}</tbody>
                </table>
                <label className="fld">تعليق المدير<input name="comment" defaultValue={a?.mgr_comment ?? ""} disabled={!editable} /></label>
                {editable && <div className="row" style={{ marginTop: 6 }}><button name="submit" value="0" className="btn">احفظ مسودة</button><button name="submit" value="1" className="btn pri">ابعت للاعتماد</button></div>}
              </form>
            </details>
          );
        })}
      </div>

      {approver && (
        <>
          <div className="card">
            <h2>مؤشرات كل وظيفة</h2>
            <div className="muted">كل سطر: اسم المؤشر | الوزن | الهدف | الوحدة | أقل (لو أقل أحسن). مثال: الهالك | 1 | 2 | % | أقل</div>
            {jobs.map((j) => (
              <form key={j} action={saveTemplate} className="row" style={{ alignItems: "end", marginTop: 8 }}>
                <input type="hidden" name="m" value={m} /><input type="hidden" name="job" value={j} />
                <label className="fld" style={{ flex: 1 }}><b>{j}</b>
                  <textarea name="items" rows={3} defaultValue={(TM.get(j) ?? []).map((i) => [i.name, i.weight, i.target, i.unit ?? "", i.lower ? "أقل" : ""].join(" | ")).join("\n")} />
                </label>
                <button className="btn">حفظ</button>
              </form>
            ))}
          </div>
          <form action={saveAppraisalRules} className="card">
            <h2>التقديرات والمكافأة</h2>
            <input type="hidden" name="m" value={m} />
            <div className="row">
              <label className="fld">أقصى نسبة للمؤشر %<input name="cap" defaultValue={g.cap ?? 120} dir="ltr" style={{ width: 80 }} /></label>
              <label className="fld">كل سطر: من % = التقدير = مكافأة % من المرتب
                <textarea name="grades" rows={4} dir="rtl" style={{ width: 300 }} defaultValue={(g.grades ?? []).map((x) => `${x.min} = ${x.name} = ${x.bonus_pct}`).join("\n")} />
              </label>
            </div>
            <button className="btn pri">احفظ</button>
          </form>
        </>
      )}
    </>
  );
}
