import Link from "next/link";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { getMe, can } from "@/lib/perms";
import Tabs, { Flash } from "../Tabs";
import { adjustCancel, payrollAdjust, payrollApprove, payrollBack, payrollCalc, payrollSend } from "../pay-actions";

type Line = { id: number; payslip_id: number; kind: string; code: string; label: string; amount: number; reason: string | null };
type Slip = { id: number; user_id: string; gross: number; deductions: number; net: number; summary: Record<string, number | string>; received_at: string | null };
const ST: Record<string, string> = { draft: "مسودة", sent: "مستنية الاعتماد", approved: "اتعتمدت ✅" };
const f = (n: number) => Math.round(Number(n)).toLocaleString("en");
const cairoMonth = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Cairo", year: "numeric", month: "2-digit" }).format(new Date());

export default async function Payroll({ searchParams }: { searchParams: Promise<{ m?: string; ok?: string; err?: string }> }) {
  const sp = await searchParams;
  const me = await getMe();
  if (!can(me, "hr.pay") && !can(me, "hr.view")) redirect("/dashboard");
  const m = /^\d{4}-\d{2}$/.test(sp.m ?? "") ? sp.m! : cairoMonth();
  const sb = await supabaseServer();
  const [{ data: run }, { data: people }, { data: adj }, { data: pays }, { data: disputes }] = await Promise.all([
    sb.from("payroll_runs").select("*").eq("month", `${m}-01`).maybeSingle(),
    sb.from("profiles").select("id,name,job,is_test,active").eq("active", true).order("name"),
    sb.from("payroll_adjustments").select("*").eq("month", `${m}-01`).eq("cancelled", false).order("id", { ascending: false }),
    sb.from("employee_pay").select("user_id,base"),
    sb.from("payslip_disputes").select("id").eq("status", "open"),
  ]);
  const slips: Slip[] = run ? ((await sb.from("payslips").select("*").eq("run_id", run.id).eq("ver", run.ver)).data ?? []) as Slip[] : [];
  const lines: Line[] = slips.length ? ((await sb.from("payslip_lines").select("*").in("payslip_id", slips.map((s) => s.id)).order("id")).data ?? []) as Line[] : [];
  const PN = new Map((people ?? []).map((p) => [p.id as string, p.name as string]));
  const noPay = (people ?? []).filter((p) => !p.is_test && !(pays ?? []).some((x) => x.user_id === p.id && Number(x.base) > 0));
  const canPay = can(me, "hr.pay");
  const tot = slips.reduce((a, s) => ({ g: a.g + Number(s.gross), d: a.d + Number(s.deductions), n: a.n + Number(s.net) }), { g: 0, d: 0, n: 0 });
  const prev = new Date(`${m}-01T12:00:00Z`); prev.setUTCMonth(prev.getUTCMonth() - 1);
  const next = new Date(`${m}-01T12:00:00Z`); next.setUTCMonth(next.getUTCMonth() + 1);
  const editable = !run || run.status === "draft";

  return (
    <>
      <div className="top"><h1>المرتبات</h1></div>
      <Tabs cur="/hr/payroll" />
      <Flash sp={sp} />
      <div className="card row" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <div className="row" style={{ alignItems: "center" }}>
          <Link className="btn" href={`/hr/payroll?m=${prev.toISOString().slice(0, 7)}`}>→</Link>
          <h2 style={{ margin: 0 }} className="num">{m}</h2>
          <Link className="btn" href={`/hr/payroll?m=${next.toISOString().slice(0, 7)}`}>←</Link>
          <b>{run ? ST[run.status] : "لسه ماتحسبتش"}</b>
          {run?.note && <span className="muted">ملاحظة: {run.note}</span>}
        </div>
        {canPay && (
          <div className="row">
            {editable && <form action={payrollCalc}><input type="hidden" name="m" value={m} /><button className="btn pri">{run?.ver ? "احسب تاني" : "احسب المرتبات"}</button></form>}
            {run?.status === "draft" && run.ver > 0 && <form action={payrollSend}><input type="hidden" name="m" value={m} /><input type="hidden" name="run" value={run.id} /><button className="btn">ابعت للاعتماد</button></form>}
            {run?.status === "sent" && <>
              <form action={payrollApprove}><input type="hidden" name="m" value={m} /><input type="hidden" name="run" value={run.id} /><button className="btn pri">اعتمد المرتبات</button></form>
              <form action={payrollBack} className="row" style={{ gap: 4 }}><input type="hidden" name="m" value={m} /><input type="hidden" name="run" value={run.id} /><input name="note" placeholder="سبب الرجوع" style={{ width: 140 }} /><button className="btn">رجّعها مسودة</button></form>
            </>}
            <Link className="btn" href="/hr/payroll/setup">بيانات القبض</Link>
          </div>
        )}
      </div>
      {!!disputes?.length && <div className="card" style={{ borderColor: "var(--bad)" }}>فيه <b>{disputes.length}</b> اعتراض على مرتبات مستني رد — <Link href="/hr/requests"><b>رد عليهم</b></Link></div>}
      {noPay.length > 0 && <div className="card muted">{noPay.length} موظف مالهمش مرتب متسجّل فمش هيدخلوا الحساب: {noPay.slice(0, 8).map((p) => p.name).join("، ")}{noPay.length > 8 ? "…" : ""} — <Link href="/hr/payroll/setup"><b>سجّل بيانات القبض</b></Link></div>}

      {!!slips.length && (
        <>
          <div className="kpis">
            <div className="kpi"><span>الموظفين</span><b className="num">{slips.length}</b></div>
            <div className="kpi"><span>الإضافات</span><b className="num">{f(tot.g)}</b></div>
            <div className="kpi"><span>الخصومات</span><b className="num">{f(tot.d)}</b></div>
            <div className="kpi"><span>الصافي</span><b className="num">{f(tot.n)}</b></div>
          </div>
          <div className="card" style={{ overflowX: "auto" }}>
            <table>
              <thead><tr><th>الموظف</th><th>حضور</th><th>غياب</th><th>تأخير</th><th>إضافي</th><th>الإضافات</th><th>الخصومات</th><th>الصافي</th><th>استلم</th></tr></thead>
              <tbody>{slips.sort((a, b) => String(PN.get(a.user_id) ?? "").localeCompare(String(PN.get(b.user_id) ?? ""))).map((s) => (
                <tr key={s.id}>
                  <td style={{ whiteSpace: "normal", minWidth: 260 }}>
                    <details><summary><b>{PN.get(s.user_id)}</b></summary>
                      <table style={{ marginTop: 6 }}><tbody>{lines.filter((l) => l.payslip_id === s.id).map((l) => (
                        <tr key={l.id}><td>{l.label}{l.reason ? <div className="muted" style={{ fontSize: 12 }}>{l.reason}</div> : null}</td><td className="num" style={{ color: l.kind === "earn" ? "var(--good)" : "var(--bad)", fontWeight: 700 }}>{l.kind === "earn" ? "+" : "−"}{f(l.amount)}</td></tr>
                      ))}</tbody></table>
                    </details>
                  </td>
                  <td className="num">{s.summary.present}/{s.summary.work_days}</td>
                  <td className="num">{s.summary.absent}</td>
                  <td className="num">{s.summary.late ? `${s.summary.late} (${s.summary.late_min}د)` : "—"}</td>
                  <td className="num">{s.summary.ot_min ? `${Math.floor(Number(s.summary.ot_min) / 60)}س` : "—"}</td>
                  <td className="num">{f(s.gross)}</td><td className="num">{f(s.deductions)}</td><td className="num"><b>{f(s.net)}</b></td>
                  <td>{s.received_at ? "✓" : "—"}</td>
                </tr>
              ))}</tbody>
            </table>
            <div className="muted">الحساب لحد {String(slips[0].summary.upto)} — الأيام اللي من غير حضور ولا إجازة متوافق عليها بتتحسب غياب.</div>
          </div>
        </>
      )}

      <div className="card">
        <h2>مكافآت وخصومات {m}</h2>
        {canPay && editable && (
          <form action={payrollAdjust} className="row" style={{ alignItems: "end" }}>
            <input type="hidden" name="m" value={m} />
            <label className="fld">الموظف<select name="user" required>{(people ?? []).filter((p) => !p.is_test).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
            <label className="fld">النوع<select name="kind"><option value="earn">مكافأة / إضافة</option><option value="deduct">خصم</option></select></label>
            <label className="fld">الاسم<input name="label" placeholder="مكافأة، بدل، خصم…" /></label>
            <label className="fld">المبلغ<input name="amount" inputMode="decimal" dir="ltr" required style={{ width: 100 }} /></label>
            <label className="fld" style={{ flex: 1 }}>السبب (إجباري)<input name="reason" required /></label>
            <button className="btn pri">سجّل</button>
          </form>
        )}
        <table style={{ marginTop: 10 }}><tbody>{(adj ?? []).map((a) => (
          <tr key={a.id}><td><b>{PN.get(a.user_id)}</b></td><td>{a.label}</td><td className="num" style={{ color: a.kind === "earn" ? "var(--good)" : "var(--bad)" }}>{a.kind === "earn" ? "+" : "−"}{f(a.amount)}</td>
            <td style={{ whiteSpace: "normal" }}>{a.reason}{a.source === "dispute" ? <span className="muted"> · من اعتراض</span> : null}</td>
            <td>{canPay && !a.payslip_id && editable && <form action={adjustCancel}><input type="hidden" name="m" value={m} /><input type="hidden" name="id" value={a.id} /><button className="btn" style={{ height: 30 }}>إلغاء</button></form>}</td></tr>
        ))}</tbody></table>
        {!adj?.length && <div className="muted">مفيش</div>}
        <div className="muted" style={{ marginTop: 8 }}>المكافأة فوق حدّك في صلاحية "المرتبات" محتاجة اللي عنده حد أعلى. أقساط السلف وعجز العهدة والاعتراضات المقبولة بتدخل لوحدها.</div>
      </div>
    </>
  );
}
