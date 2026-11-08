"use server";
import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase/server";
import { getMe, can } from "@/lib/perms";
import { dbMsg, type Result } from "@/lib/scan";

export async function addExpense(loc: string, cat: number, amount: number, from: string, note: string, photo: string | null, day: string | null): Promise<Result<{ no: number; status: string }>> {
  const me = await getMe();
  if (!can(me, "acc.post")) throw new Error("ليس لديك صلاحية إضافة مصروفات");
  const sb = await supabaseServer();
  if (!loc || !cat) return { ok: false, error: "اختار المكان والبند" };
  if (!(amount > 0)) return { ok: false, error: "اكتب المبلغ" };
  const { data, error } = await sb.rpc("add_expense", { p_loc: loc, p_cat: cat, p_amount: amount, p_from: from, p_note: note, p_photo: photo, p_day: day || null });
  if (error) return { ok: false, error: dbMsg(error.message) };
  const r = (Array.isArray(data) ? data[0] : data) as { expense_no: number; exp_status: string };
  revalidatePath("/accounts/expenses"); revalidatePath("/accounts");
  return { ok: true, no: Number(r.expense_no), status: r.exp_status };
}

export async function decideExpense(fd: FormData) {
  const me = await getMe();
  if (!can(me, "acc.approve")) throw new Error("ليس لديك صلاحية الموافقة على المصروفات");
  const sb = await supabaseServer();
  await sb.rpc("decide_expense", { p_id: Number(fd.get("id")), p_approve: fd.get("approve") === "1", p_note: String(fd.get("note") || "") });
  revalidatePath("/accounts/expenses");
}

export async function addCategory(fd: FormData) {
  const me = await getMe();
  if (!can(me, "acc.approve")) throw new Error("ليس لديك صلاحية إدارة بنود المصروفات");
  const sb = await supabaseServer();
  const name = String(fd.get("name") || "").trim();
  if (name) await sb.from("expense_categories").insert({ name });
  revalidatePath("/accounts/expenses");
}

export async function paySupplier(sup: number, amount: number, method: string, ref: string, note: string): Promise<Result<{ no: number }>> {
  const me = await getMe();
  if (!can(me, "acc.pay")) throw new Error("ليس لديك صلاحية دفع للموردين");
  const sb = await supabaseServer();
  if (!(amount > 0)) return { ok: false, error: "اكتب المبلغ" };
  const { data, error } = await sb.rpc("pay_supplier", { p_sup: sup, p_amount: amount, p_method: method, p_ref: ref, p_note: note });
  if (error) return { ok: false, error: dbMsg(error.message) };
  revalidatePath("/accounts/suppliers"); revalidatePath(`/accounts/suppliers/${sup}`);
  return { ok: true, no: Number(data) };
}
