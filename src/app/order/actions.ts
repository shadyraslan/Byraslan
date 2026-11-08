"use server";
import { supabaseServer } from "@/lib/supabase/server";
import { dbMsg, type Result } from "@/lib/scan";
import { checkRateLimit, clearRateLimit } from "@/lib/rate-limit";

export type Menu = { item_id: number; name: string; unit: string; sold_by: string; price: number; family: string | null; available: number };

export async function getMenu(loc: string): Promise<Menu[]> {
  const sb = await supabaseServer();
  const { data } = await sb.rpc("public_menu", { p_loc: loc });
  return ((data ?? []) as Menu[]).map((m) => ({ ...m, price: Number(m.price), available: Number(m.available) }));
}

export async function placeOrder(o: { loc: string; phone: string; name: string; address: string; area: string; note: string; pay: string; channel: string; lines: { item_id: number; qty: number }[] }): Promise<Result<{ no: number; token: string; total: number }>> {
  // Rate Limiting — حماية من طلبات كثيرة بناءً على رقم الموبايل
  const { allowed, resetIn } = checkRateLimit(`order:${o.phone}`, 5, 60 * 60 * 1000);
  if (!allowed) return { ok: false, error: `طلبات كثيرة. حاول بعد ${resetIn} دقيقة` };

  // التحقق من المدخلات
  if (!o.phone.trim()) return { ok: false, error: "اكتب رقم الموبايل" };
  if (!o.name.trim()) return { ok: false, error: "اكتب الاسم" };
  if (!o.address.trim()) return { ok: false, error: "اكتب العنوان" };
  if (!o.lines.length) return { ok: false, error: "اختار منتجات على الأقل" };

  const sb = await supabaseServer();
  const { data, error } = await sb.rpc("place_order", { p_loc: o.loc, p_phone: o.phone, p_name: o.name, p_address: o.address, p_area: o.area, p_note: o.note, p_pay: o.pay, p_lines: o.lines, p_channel: o.channel });
  if (error) return { ok: false, error: dbMsg(error.message) };
  clearRateLimit(`order:${o.phone}`);
  const r = (Array.isArray(data) ? data[0] : data) as { order_no: number; token: string; est_total: number };
  return { ok: true, no: Number(r.order_no), token: r.token, total: Number(r.est_total) };
}
