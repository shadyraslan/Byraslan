"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";

const msg = (e: { message?: string } | null) => (e?.message ?? "").replace(/^.*?ERROR:\s*/, "");
const S = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const N = (fd: FormData, k: string) => Number(S(fd, k) || 0);

/** بيرجع لنفس الصفحة برسالة نجاح أو غلط */
async function done(back: string, error: { message?: string } | null, ok: string): Promise<never> {
  revalidatePath(back.split("?")[0]);
  const sep = back.includes("?") ? "&" : "?";
  redirect(error ? `${back}${sep}err=${encodeURIComponent(msg(error))}` : `${back}${sep}ok=${encodeURIComponent(ok)}`);
}

// ===== المرتبات =====
export async function payrollCalc(fd: FormData) {
  const sb = await supabaseServer();
  const m = S(fd, "m");
  const { error } = await sb.rpc("payroll_calc", { p_month: `${m}-01` });
  await done(`/hr/payroll?m=${m}`, error, "اتحسبت المرتبات من الحضور واللايحة");
}
export async function payrollSend(fd: FormData) {
  const sb = await supabaseServer();
  const { error } = await sb.rpc("payroll_send", { p_run: N(fd, "run") });
  await done(`/hr/payroll?m=${S(fd, "m")}`, error, "اتبعتت للاعتماد");
}
export async function payrollBack(fd: FormData) {
  const sb = await supabaseServer();
  const { error } = await sb.rpc("payroll_back", { p_run: N(fd, "run"), p_note: S(fd, "note") });
  await done(`/hr/payroll?m=${S(fd, "m")}`, error, "رجعت مسودة");
}
export async function payrollApprove(fd: FormData) {
  const sb = await supabaseServer();
  const { error } = await sb.rpc("payroll_approve", { p_run: N(fd, "run") });
  await done(`/hr/payroll?m=${S(fd, "m")}`, error, "اتعتمدت — اتسجّلت في المصروفات ووصل إشعار لكل موظف");
}
export async function payrollAdjust(fd: FormData) {
  const sb = await supabaseServer();
  const m = S(fd, "m");
  const { error } = await sb.rpc("payroll_adjust", { p_user: S(fd, "user"), p_month: `${m}-01`, p_kind: S(fd, "kind"), p_label: S(fd, "label"), p_amount: N(fd, "amount"), p_reason: S(fd, "reason") });
  await done(`/hr/payroll?m=${m}`, error, "اتسجّلت — احسب المرتبات تاني عشان تدخل");
}
export async function adjustCancel(fd: FormData) {
  const sb = await supabaseServer();
  const { error } = await sb.from("payroll_adjustments").update({ cancelled: true }).eq("id", N(fd, "id")).is("payslip_id", null);
  await done(`/hr/payroll?m=${S(fd, "m")}`, error, "اتلغت");
}
export async function savePay(fd: FormData) {
  const sb = await supabaseServer();
  const { error } = await sb.from("employee_pay").upsert({
    user_id: S(fd, "user"), pay_type: S(fd, "pay_type") || "monthly", base: N(fd, "base"), allowances: N(fd, "allowances"), insurance_wage: N(fd, "ins"),
    shift_start: S(fd, "shift") || "09:00", rest_day: N(fd, "rest"), hire_date: S(fd, "hire") || new Date().toISOString().slice(0, 10),
    custody_max: S(fd, "cmax") ? N(fd, "cmax") : null, updated_at: new Date().toISOString(),
  });
  await done("/hr/payroll/setup", error, "اتحفظ");
}

// ===== العهد =====
export async function custodyGive(fd: FormData) {
  const sb = await supabaseServer();
  const { error } = await sb.rpc("custody_give", { p_user: S(fd, "user"), p_amount: N(fd, "amount"), p_note: S(fd, "note") });
  await done("/hr/custody", error, "اتسجّلت العهدة ووصله إشعار");
}
export async function custodyDecide(fd: FormData) {
  const sb = await supabaseServer();
  const { error } = await sb.rpc("custody_decide", { p_id: N(fd, "id"), p_ok: S(fd, "ok") === "1", p_note: S(fd, "note") });
  await done("/hr/custody", error, "اتسجّل الرد");
}
export async function custodyConfirm(fd: FormData) {
  const sb = await supabaseServer();
  const { error } = await sb.rpc("custody_confirm_return", { p_id: N(fd, "id"), p_received: Number(S(fd, "received") || -1), p_note: S(fd, "note") });
  await done("/hr/custody", error, "اتأكّد الاستلام");
}

// ===== الاعتراضات والأوراق =====
export async function disputeDecide(fd: FormData) {
  const sb = await supabaseServer();
  const { error } = await sb.rpc("dispute_decide", { p_id: N(fd, "id"), p_accept: S(fd, "ok") === "1", p_amount: N(fd, "amount"), p_reply: S(fd, "reply") });
  await done("/hr/requests", error, "اتبعت الرد للموظف");
}
export async function docDecide(fd: FormData) {
  const sb = await supabaseServer();
  const { error } = await sb.rpc("doc_decide", { p_id: N(fd, "id"), p_status: S(fd, "status"), p_reply: S(fd, "reply"), p_file: S(fd, "file") });
  await done("/hr/requests", error, "اتسجّل");
}

// ===== اللايحة والأرصدة =====
const tiers = (t: string) => t.split(/\n/).map((l) => l.match(/(\d+)\s*[-–]\s*(\d+)\s*=\s*([\d.]+)/)).filter(Boolean).map((m) => ({ from: +m![1], to: +m![2], days: +m![3] }));
const brackets = (t: string) => t.split(/\n/).map((l) => l.match(/(\d+|فوق)\s*=\s*([\d.]+)/)).filter(Boolean).map((m) => [m![1] === "فوق" ? null : +m![1], +m![2]]);
const lose = (t: string) => t.split(/\n/).map((l) => l.match(/(\d+)\s*=\s*(\d+)/)).filter(Boolean).map((m) => [+m![1], +m![2]]);
export async function saveRules(fd: FormData) {
  const sb = await supabaseServer();
  const now = new Date().toISOString();
  const { error } = await sb.from("settings").upsert([
    { key: "hr.payroll", updated_at: now, value: {
      divisor: N(fd, "divisor") || 30, day_hours: N(fd, "day_hours") || 8, grace_min: N(fd, "grace"), late_tiers: tiers(S(fd, "tiers")),
      absence_days: N(fd, "absence"), ot_rate: N(fd, "ot_rate") || 1, ot_min: N(fd, "ot_min"), ins_pct: N(fd, "ins_pct"),
      tax_exempt: N(fd, "tax_exempt"), tax_brackets: brackets(S(fd, "brackets")), tax_lose: lose(S(fd, "lose")), shortage_to_payroll: fd.get("short") === "on" } },
    { key: "hr.leave", updated_at: now, value: { annual: N(fd, "annual"), first_year: N(fd, "first_year"), casual: N(fd, "casual"), sick_pay_pct: N(fd, "sick") } },
    { key: "hr.custody", updated_at: now, value: { spend_limit: N(fd, "spend_limit") } },
    { key: "hr.advance", updated_at: now, value: { max_salaries: N(fd, "max_salaries") || 1, max_installments: N(fd, "max_inst") || 1 } },
  ]);
  await done("/hr/rules", error, "اتحفظت — بتطبّق من أول حساب مرتبات جاي");
}
