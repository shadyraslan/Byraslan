"use server";
import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase/server";
import { getMe, can } from "@/lib/perms";
import { dbMsg, type Result } from "@/lib/scan";

export type PosLine = { item_id: number; item_name: string; unit: string; box_sn: number | null; qty: number; unit_price: number };
export type Receipt = { sale_no: number; total: number; change: number };

export async function openShift(fd: FormData) {
  const me = await getMe();
  if (!can(me, "pos.sell")) throw new Error("ليس لديك صلاحية فتح وردية");
  const sb = await supabaseServer();
  await sb.rpc("pos_open_shift", { p_loc: String(fd.get("loc")), p_cash: Number(fd.get("cash") || 0) });
  revalidatePath("/pos");
}

export async function posLookup(loc: string, code: string): Promise<Result<{ line: PosLine }>> {
  const me = await getMe();
  if (!can(me, "pos.sell")) return { ok: false, error: "ليس لديك صلاحية" };
  const sb = await supabaseServer();
  const { data, error } = await sb.rpc("pos_lookup", { p_loc: loc, p_code: code });
  if (error) return { ok: false, error: dbMsg(error.message) };
  const r = (Array.isArray(data) ? data[0] : data) as PosLine | undefined;
  if (!r) return { ok: false, error: "الكود ده مش متسجّل" };
  return { ok: true, line: { ...r, qty: Number(r.qty), unit_price: Number(r.unit_price), box_sn: r.box_sn ? Number(r.box_sn) : null, item_id: Number(r.item_id) } };
}

export async function posSale(shift: number, lines: PosLine[], discount: number, cash: number, card: number): Promise<Result<{ r: Receipt }>> {
  const me = await getMe();
  if (!can(me, "pos.sell")) throw new Error("ليس لديك صلاحية البيع");
  if (discount < 0) return { ok: false, error: "الخصم ما يقدرش يكون سالب" };
  if (cash < 0 || card < 0) return { ok: false, error: "المبالغ ما تقدرش تكون سالبة" };
  if (lines.length === 0) return { ok: false, error: "اختار منتجات على الأقل" };
  const sb = await supabaseServer();
  const payload = lines.map((l) => (l.box_sn ? { box_sn: l.box_sn } : { item_id: l.item_id, qty: l.qty }));
  const { data, error } = await sb.rpc("pos_sale", { p_shift: shift, p_lines: payload, p_discount: discount, p_cash: cash, p_card: card });
  if (error) return { ok: false, error: dbMsg(error.message) };
  const r = (Array.isArray(data) ? data[0] : data) as { sale_no: number; total: number; change: number };
  revalidatePath("/stock");
  return { ok: true, r: { sale_no: Number(r.sale_no), total: Number(r.total), change: Number(r.change) } };
}

export async function closeShift(shift: number, counted: number): Promise<Result<{ diff: number }>> {
  const me = await getMe();
  if (!can(me, "pos.sell")) throw new Error("ليس لديك صلاحية إغلاق وردية");
  const sb = await supabaseServer();
  const { data, error } = await sb.rpc("pos_close_shift", { p_shift: shift, p_counted: counted });
  if (error) return { ok: false, error: dbMsg(error.message) };
  revalidatePath("/pos");
  return { ok: true, diff: Number(data) };
}
