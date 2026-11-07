"use server";
import { need } from "@/lib/perms";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";

const msg = (e: { message?: string } | null) => (e?.message ?? "").replace(/^.*?ERROR:\s*/, "");
const S = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const N = (fd: FormData, k: string) => Number(S(fd, k) || 0);
async function done(back: string, error: { message?: string } | null, ok: string): Promise<never> {
  revalidatePath(back.split("?")[0]);
  const sep = back.includes("?") ? "&" : "?";
  redirect(error ? `${back}${sep}err=${encodeURIComponent(msg(error))}` : `${back}${sep}ok=${encodeURIComponent(ok)}`);
}

// ===== الجزاءات =====
export async function issuePenalty(fd: FormData) {
  await need();
  const sb = await supabaseServer();
  const { data, error } = await sb.rpc("penalty_issue", { p_user: S(fd, "user"), p_rule: N(fd, "rule"), p_day: S(fd, "day"), p_reason: S(fd, "reason") });
  const r = data as { no: number; occurrence: number; action: string; days: number } | null;
  await done("/hr/penalties", error, r ? `اتسجّل جزاء ${r.no} — المرة ${r.occurrence}: ${r.action === "deduct" ? `خصم ${r.days} يوم` : r.action === "warning" ? "إنذار كتابي" : "لفت نظر"} — ووصل للموظف يأكّد` : "");
}
export async function cancelPenalty(fd: FormData) {
  await need("hr.penalty");
  const sb = await supabaseServer();
  const { error } = await sb.rpc("penalty_cancel", { p_id: N(fd, "id"), p_note: S(fd, "note") });
  await done("/hr/penalties", error, "اتلغى الجزاء");
}
export async function saveRule(fd: FormData) {
  await need("settings.edit", "hr.penalty");
  const sb = await supabaseServer();
  // الخطوات: "لفت نظر، إنذار، خصم 0.5، خصم 1"
  const steps = S(fd, "steps").split(/[,،\n]/).map((x) => x.trim()).filter(Boolean).map((x) => {
    if (/لفت/.test(x)) return { action: "notice" };
    if (/إنذار|انذار/.test(x)) return { action: "warning" };
    const d = Number((x.match(/[\d.]+/) ?? ["1"])[0]);
    return { action: "deduct", days: d };
  });
  if (!S(fd, "name") || !steps.length) await done("/hr/penalties", { message: "اكتب المخالفة والجزاء لكل مرة" }, "");
  const row = { name: S(fd, "name"), steps, active: fd.get("active") !== "off", sort: N(fd, "sort") };
  const id = N(fd, "id");
  const { error } = id ? await sb.from("penalty_rules").update(row).eq("id", id) : await sb.from("penalty_rules").insert(row);
  await done("/hr/penalties", error, "اتحفظت اللايحة");
}
export async function savePenaltyCfg(fd: FormData) {
  await need("settings.edit");
  const sb = await supabaseServer();
  const { error } = await sb.from("settings").upsert({ key: "hr.penalty", value: { window_months: N(fd, "win") || 6, max_days_month: N(fd, "max") || 5 } });
  await done("/hr/penalties", error, "اتحفظ");
}

// ===== العهد العينية =====
export async function giveAsset(fd: FormData) {
  await need("hr.assets");
  const sb = await supabaseServer();
  const { error } = await sb.rpc("asset_give", { p_user: S(fd, "user"), p_name: S(fd, "name"), p_serial: S(fd, "serial"), p_value: N(fd, "value"), p_note: S(fd, "note") });
  await done("/hr/assets", error, "اتسجّلت العهدة ووصلت للموظف يأكّد");
}
export async function returnAsset(fd: FormData) {
  await need("hr.assets");
  const sb = await supabaseServer();
  const { error } = await sb.rpc("asset_return", { p_id: N(fd, "id"), p_condition: S(fd, "cond") });
  await done("/hr/assets", error, "اتسجّل الاسترجاع");
}

// ===== المستندات =====
export async function saveStaffDoc(fd: FormData) {
  await need("hr.staffdocs");
  const sb = await supabaseServer();
  const { error } = await sb.rpc("staff_doc_save", { p_user: S(fd, "user"), p_type: S(fd, "type"), p_number: S(fd, "number"), p_expires: S(fd, "expires") || null, p_photo: S(fd, "photo") || null, p_note: S(fd, "note") });
  await done(`/hr/staffdocs${S(fd, "f") ? `?f=${S(fd, "f")}` : ""}`, error, "اتحفظ المستند");
}
export async function saveDocTypes(fd: FormData) {
  await need("settings.edit");
  const sb = await supabaseServer();
  const keys = fd.getAll("key").map(String);
  const v = keys.map((k, i) => ({
    key: k || `t${Date.now()}${i}`, name: String(fd.getAll("name")[i] ?? "").trim(), alert_days: Number(fd.getAll("alert")[i] || 30),
    block: fd.getAll("block").map(String).includes(String(i)), locs: String(fd.getAll("locs")[i] ?? "").split(",").map((x) => x.trim()).filter(Boolean),
  })).filter((x) => x.name);
  const { error } = await sb.from("settings").upsert({ key: "hr.doc_types", value: v });
  await done("/hr/staffdocs", error, "اتحفظت أنواع المستندات");
}

// ===== المخالصة =====
export async function calcSettlement(fd: FormData) {
  await need("hr.settle");
  const sb = await supabaseServer();
  const { data, error } = await sb.rpc("settlement_calc", { p_user: S(fd, "user"), p_last_day: S(fd, "day"), p_reason: S(fd, "reason") });
  await done(`/hr/settle${data ? `?id=${data}` : ""}`, error, "اتحسبت المخالصة — راجعها واعتمد");
}
export async function approveSettlement(fd: FormData) {
  await need("hr.settle");
  const sb = await supabaseServer();
  const { error } = await sb.rpc("settlement_approve", { p_id: N(fd, "id") });
  await done(`/hr/settle?id=${N(fd, "id")}`, error, "اتعمدت المخالصة — الحساب اتقفل وصلاحياته اتشالت");
}

// ===== تأكيد التواجد =====
export async function excusePresence(fd: FormData) {
  await need();
  const sb = await supabaseServer();
  const { error } = await sb.rpc("presence_excuse", { p_id: N(fd, "id") });
  await done("/hr/presence", error, "اتعذر — مش هيتخصم");
}
export async function savePresenceCfg(fd: FormData) {
  await need("settings.edit");
  const sb = await supabaseServer();
  const { error } = await sb.from("settings").upsert({ key: "hr.presence", value: {
    on: fd.get("on") === "on", per_day: N(fd, "per"), window_min: N(fd, "win") || 10, deduct_hours: Number(S(fd, "ded") || 1), max_m: N(fd, "max") || 300 } });
  await done("/hr/presence", error, "اتحفظ");
}
