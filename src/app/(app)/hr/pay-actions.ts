"use server";
import { need } from "@/lib/perms";
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
  await need("hr.pay");
  const sb = await supabaseServer();
  const m = S(fd, "m");
  const { error } = await sb.rpc("payroll_calc", { p_month: `${m}-01` });
  await done(`/hr/payroll?m=${m}`, error, "اتحسبت المرتبات من الحضور واللايحة");
}
export async function payrollSend(fd: FormData) {
  await need("hr.pay");
  const sb = await supabaseServer();
  const { error } = await sb.rpc("payroll_send", { p_run: N(fd, "run") });
  await done(`/hr/payroll?m=${S(fd, "m")}`, error, "اتبعتت للاعتماد");
}
export async function payrollBack(fd: FormData) {
  await need("hr.pay");
  const sb = await supabaseServer();
  const { error } = await sb.rpc("payroll_back", { p_run: N(fd, "run"), p_note: S(fd, "note") });
  await done(`/hr/payroll?m=${S(fd, "m")}`, error, "رجعت مسودة");
}
export async function payrollApprove(fd: FormData) {
  await need("hr.pay");
  const sb = await supabaseServer();
  const { error } = await sb.rpc("payroll_approve", { p_run: N(fd, "run") });
  await done(`/hr/payroll?m=${S(fd, "m")}`, error, "اتعتمدت — اتسجّلت في المصروفات ووصل إشعار لكل موظف");
}
export async function payrollAdjust(fd: FormData) {
  await need("hr.pay");
  const sb = await supabaseServer();
  const m = S(fd, "m");
  const { error } = await sb.rpc("payroll_adjust", { p_user: S(fd, "user"), p_month: `${m}-01`, p_kind: S(fd, "kind"), p_label: S(fd, "label"), p_amount: N(fd, "amount"), p_reason: S(fd, "reason") });
  await done(`/hr/payroll?m=${m}`, error, "اتسجّلت — احسب المرتبات تاني عشان تدخل");
}
export async function adjustCancel(fd: FormData) {
  await need("hr.pay");
  const sb = await supabaseServer();
  const { error } = await sb.from("payroll_adjustments").update({ cancelled: true }).eq("id", N(fd, "id")).is("payslip_id", null);
  await done(`/hr/payroll?m=${S(fd, "m")}`, error, "اتلغت");
}
export async function savePay(fd: FormData) {
  await need("hr.pay");
  const sb = await supabaseServer();
  const { error } = await sb.from("employee_pay").upsert({
    user_id: S(fd, "user"), pay_type: S(fd, "pay_type") || "monthly", base: N(fd, "base"), allowances: N(fd, "allowances"), insurance_wage: N(fd, "ins"),
    shift_start: S(fd, "shift") || "09:00", rest_day: N(fd, "rest"), hire_date: S(fd, "hire") || new Date().toISOString().slice(0, 10),
    custody_max: S(fd, "cmax") ? N(fd, "cmax") : null, manager_id: S(fd, "mgr") || null, updated_at: new Date().toISOString(),
  });
  await done("/hr/payroll/setup", error, "اتحفظ");
}

// ===== العهد =====
export async function custodyGive(fd: FormData) {
  await need();
  const sb = await supabaseServer();
  const { error } = await sb.rpc("custody_give", { p_user: S(fd, "user"), p_amount: N(fd, "amount"), p_note: S(fd, "note") });
  await done("/hr/custody", error, "اتسجّلت العهدة ووصله إشعار");
}
export async function custodyDecide(fd: FormData) {
  await need();
  const sb = await supabaseServer();
  const { error } = await sb.rpc("custody_decide", { p_id: N(fd, "id"), p_ok: S(fd, "ok") === "1", p_note: S(fd, "note") });
  await done("/hr/custody", error, "اتسجّل الرد");
}
export async function custodyConfirm(fd: FormData) {
  await need();
  const sb = await supabaseServer();
  const { error } = await sb.rpc("custody_confirm_return", { p_id: N(fd, "id"), p_received: Number(S(fd, "received") || -1), p_note: S(fd, "note") });
  await done("/hr/custody", error, "اتأكّد الاستلام");
}

// ===== الاعتراضات والأوراق =====
export async function disputeDecide(fd: FormData) {
  await need("hr.pay");
  const sb = await supabaseServer();
  const { error } = await sb.rpc("dispute_decide", { p_id: N(fd, "id"), p_accept: S(fd, "ok") === "1", p_amount: N(fd, "amount"), p_reply: S(fd, "reply") });
  await done("/hr/requests", error, "اتبعت الرد للموظف");
}
export async function docDecide(fd: FormData) {
  await need("hr.docs");
  const sb = await supabaseServer();
  const { error } = await sb.rpc("doc_decide", { p_id: N(fd, "id"), p_status: S(fd, "status"), p_reply: S(fd, "reply"), p_file: S(fd, "file") });
  await done("/hr/requests", error, "اتسجّل");
}

// ===== اللايحة والأرصدة =====
const tiers = (t: string) => t.split(/\n/).map((l) => l.match(/(\d+)\s*[-–]\s*(\d+)\s*=\s*([\d.]+)/)).filter(Boolean).map((m) => ({ from: +m![1], to: +m![2], days: +m![3] }));
const brackets = (t: string) => t.split(/\n/).map((l) => l.match(/(\d+|فوق)\s*=\s*([\d.]+)/)).filter(Boolean).map((m) => [m![1] === "فوق" ? null : +m![1], +m![2]]);
const lose = (t: string) => t.split(/\n/).map((l) => l.match(/(\d+)\s*=\s*(\d+)/)).filter(Boolean).map((m) => [+m![1], +m![2]]);
export async function saveRules(fd: FormData) {
  await need("settings.edit");
  const sb = await supabaseServer();
  const now = new Date().toISOString();
  const { error } = await sb.from("settings").upsert([
    { key: "hr.payroll", updated_at: now, value: {
      divisor: N(fd, "divisor") || 30, day_hours: N(fd, "day_hours") || 8, grace_min: N(fd, "grace"), late_tiers: tiers(S(fd, "tiers")),
      absence_days: N(fd, "absence"), ot_rate: N(fd, "ot_rate") || 1, ot_min: N(fd, "ot_min"), ins_pct: N(fd, "ins_pct"),
      tax_exempt: N(fd, "tax_exempt"), tax_brackets: brackets(S(fd, "brackets")), tax_lose: lose(S(fd, "lose")), shortage_to_payroll: fd.get("short") === "on",
      go_live: S(fd, "go_live") || null, early_grace: N(fd, "early_grace"), early_tiers: tiers(S(fd, "early_tiers")), holiday_extra_days: N(fd, "hol_extra"), rest_extra_days: N(fd, "rest_extra") } },
    { key: "hr.leave", updated_at: now, value: { annual: N(fd, "annual"), first_year: N(fd, "first_year"), casual: N(fd, "casual"), sick_pay_pct: N(fd, "sick") } },
    { key: "hr.custody", updated_at: now, value: { spend_limit: N(fd, "spend_limit") } },
    { key: "hr.advance", updated_at: now, value: { max_salaries: N(fd, "max_salaries") || 1, max_installments: N(fd, "max_inst") || 1 } },
    { key: "hr.shifts", updated_at: now, value: { cutoff: S(fd, "cutoff") || "20:00", notify: fd.get("notify") === "on" } },
    { key: "hr.permits", updated_at: now, value: { max_paid_month: N(fd, "max_permits") } },
    { key: "hr.staff_credit", updated_at: now, value: { on: fd.get("credit_on") === "on", limit_month: N(fd, "credit_limit"), discount_pct: Math.min(Math.max(N(fd, "credit_disc"), 0), 100) } },
  ]);
  await done("/hr/rules", error, "اتحفظت — بتطبّق من أول حساب مرتبات جاي");
}

// ===== الورديات والأذون =====
export async function saveShifts(fd: FormData) {
  await need();
  const sb = await supabaseServer();
  const rows: { user: string; day: string; start?: string; end?: string; off?: boolean }[] = [];
  for (const [k, v] of fd.entries()) {
    const m = k.match(/^s:([0-9a-f-]{36}):(\d{4}-\d{2}-\d{2})$/);
    if (!m) continue;
    const t = String(v).trim();
    if (!t) continue;
    if (/^(راحة|r|off|-)$/i.test(t)) rows.push({ user: m[1], day: m[2], off: true });
    else {
      // الوردية بميعاد البداية بس — النهاية = البداية + ساعات اليوم
      const x = t.match(/^(\d{1,2})(?::(\d{2}))?\s*(ص|م|am|pm)?$/i);
      if (!x) await done(`/hr/shifts?w=${S(fd, "w")}`, { message: `"${t}" مش مفهومة — اكتب ميعاد البداية زي 9 أو 9:30 أو 14 أو راحة` }, "");
      let h = Number(x![1]); const ap = (x![3] ?? "").toLowerCase();
      if ((ap === "م" || ap === "pm") && h < 12) h += 12;
      if ((ap === "ص" || ap === "am") && h === 12) h = 0;
      if (h > 23) await done(`/hr/shifts?w=${S(fd, "w")}`, { message: `"${t}" ساعة غلط` }, "");
      rows.push({ user: m[1], day: m[2], start: `${String(h).padStart(2, "0")}:${x![2] ?? "00"}`, end: "" });
    }
  }
  const { data, error } = await sb.rpc("shift_set", { p_rows: rows });
  await done(`/hr/shifts?w=${S(fd, "w")}`, error, `اتحفظ (${data ?? 0} تغيير) — الإشعارات بتتبعت لوحدها قبل كل يوم`);
}
export async function grantPermit(fd: FormData) {
  await need();
  const sb = await supabaseServer();
  const { error } = await sb.rpc("permit_grant", { p_user: S(fd, "user"), p_day: S(fd, "day"), p_kind: S(fd, "kind"), p_time: S(fd, "time") || null, p_paid: fd.get("paid") === "on", p_reason: S(fd, "reason") });
  await done(`/hr/shifts?w=${S(fd, "w")}`, error, "اتسجّل الإذن ووصل للموظف");
}
export async function decidePermit(fd: FormData) {
  await need();
  const sb = await supabaseServer();
  const { error } = await sb.rpc("permit_decide", { p_id: N(fd, "id"), p_ok: S(fd, "ok") === "1", p_paid: fd.get("paid") === "on" });
  await done(`/hr/shifts?w=${S(fd, "w")}`, error, "اتسجّل");
}

// ===== أيام الشركة والإجازات الرسمية =====
export async function addDay(fd: FormData) {
  await need("hr.days");
  const sb = await supabaseServer();
  const scope = S(fd, "scope") || "all";
  const from = S(fd, "day"), to = S(fd, "to") || from;
  const days: string[] = [];
  for (let d = new Date(`${from}T12:00:00Z`); d <= new Date(`${to}T12:00:00Z`) && days.length < 31; d.setUTCDate(d.getUTCDate() + 1)) days.push(d.toISOString().slice(0, 10));
  const { error } = await sb.from("company_days").insert(days.map((day) => ({
    day, kind: S(fd, "kind"), name: S(fd, "name") || "إجازة", scope,
    locs: scope === "loc" ? fd.getAll("locs").map(String) : [], users: scope === "users" ? fd.getAll("users").map(String) : [], for_day: S(fd, "kind") === "substitute" ? S(fd, "for_day") || null : null,
  })));
  await done("/hr/days", error, "اتسجّلت — بتدخل في المرتبات والأرصدة لوحدها");
}
export async function cancelDay(fd: FormData) {
  await need("hr.days");
  const sb = await supabaseServer();
  const { error } = await sb.from("company_days").update({ cancelled: true }).eq("id", N(fd, "id"));
  await done("/hr/days", error, "اتلغت");
}

// ===== تقييم الأداء =====
export async function saveTemplate(fd: FormData) {
  await need();
  const sb = await supabaseServer();
  const items = S(fd, "items").split(/\n/).map((l) => l.split("|").map((x) => x.trim())).filter((p) => p[0])
    .map(([name, weight, target, unit, lower]) => ({ name, weight: Number(weight) || 1, target: Number(target) || 0, unit: unit || "", lower: /أقل|lower|-/.test(lower ?? "") }));
  const { error } = await sb.from("kpi_templates").upsert({ job: S(fd, "job"), items, updated_at: new Date().toISOString() });
  await done(`/hr/appraisals?m=${S(fd, "m")}`, error, "اتحفظت مؤشرات الوظيفة");
}
export async function saveAppraisal(fd: FormData) {
  await need();
  const sb = await supabaseServer();
  const n = N(fd, "n");
  const items = Array.from({ length: n }, (_, i) => ({ name: S(fd, `name${i}`), weight: N(fd, `w${i}`) || 1, target: N(fd, `t${i}`), unit: S(fd, `u${i}`), lower: S(fd, `l${i}`) === "1", actual: S(fd, `a${i}`) === "" ? null : N(fd, `a${i}`), note: S(fd, `note${i}`) })).filter((i) => i.name);
  const { error } = await sb.rpc("appraisal_save", { p_user: S(fd, "user"), p_month: `${S(fd, "m")}-01`, p_items: items, p_comment: S(fd, "comment"), p_submit: S(fd, "submit") === "1" });
  await done(`/hr/appraisals?m=${S(fd, "m")}`, error, S(fd, "submit") === "1" ? "اتبعت للاعتماد" : "اتحفظ مسودة");
}
export async function decideAppraisal(fd: FormData) {
  await need();
  const sb = await supabaseServer();
  const { error } = await sb.rpc("appraisal_decide", { p_id: N(fd, "id"), p_ok: S(fd, "ok") === "1", p_note: S(fd, "note") });
  await done(`/hr/appraisals?m=${S(fd, "m")}`, error, S(fd, "ok") === "1" ? "اتعتمد — المكافأة نزلت في المرتب ووصل إشعار للموظف" : "رجع للمدير");
}
export async function saveAppraisalRules(fd: FormData) {
  await need("settings.edit");
  const sb = await supabaseServer();
  const grades = S(fd, "grades").split(/\n/).map((l) => l.match(/^\s*([\d.]+)\s*=\s*([^=]+?)\s*=\s*([\d.]+)\s*$/)).filter(Boolean).map((m) => ({ min: +m![1], name: m![2], bonus_pct: +m![3] })).sort((a, b) => b.min - a.min);
  const { error } = await sb.from("settings").upsert({ key: "hr.appraisal", value: { cap: N(fd, "cap") || 120, grades }, updated_at: new Date().toISOString() });
  await done(`/hr/appraisals?m=${S(fd, "m")}`, error, "اتحفظت التقديرات");
}

// ===== نص اللايحة =====
export async function publishPolicy(fd: FormData) {
  await need("settings.edit");
  const sb = await supabaseServer();
  const { data, error } = await sb.rpc("policy_publish", { p_text: S(fd, "text") });
  await done("/hr/policy", error, `اتنشرت النسخة ${data ?? ""} — كل موظف لازم يوافق عليها من التطبيق`);
}
