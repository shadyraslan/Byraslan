"use server";
import { deny } from "@/lib/perms";
import { supabaseServer } from "@/lib/supabase/server";
import { dbMsg, type Result } from "@/lib/scan";

export type Menu = { item_id: number; name: string; unit: string; sold_by: string; price: number; family: string | null; available: number };

export async function getMenu(loc: string): Promise<Menu[]> {
  const sb = await supabaseServer();
  const { data } = await sb.rpc("public_menu", { p_loc: loc });
  return ((data ?? []) as Menu[]).map((m) => ({ ...m, price: Number(m.price), available: Number(m.available) }));
}

export async function placeOrder(o: { district: number; phone: string; name: string; address: string; note: string; pay: string; channel: string; lines: { item_id: number; qty: number }[] }): Promise<Result<{ no: number; token: string; total: number }>> {
  const sb = await supabaseServer();
  const { data, error } = await sb.rpc("place_order_d", { p_district: o.district, p_phone: o.phone, p_name: o.name, p_address: o.address, p_note: o.note, p_pay: o.pay, p_lines: o.lines, p_channel: o.channel });
  if (error) return { ok: false, error: dbMsg(error.message) };
  const r = (Array.isArray(data) ? data[0] : data) as { order_no: number; token: string; est_total: number };
  return { ok: true, no: Number(r.order_no), token: r.token, total: Number(r.est_total) };
}

// الموظف: طلب واتساب/تليفون (بيتسجّل باسمه)
export async function staffPlace(o: { district: number; phone: string; name: string; address: string; note: string; pay: string; channel: string; lines: { item_id: number; qty: number }[] }): Promise<Result<{ no: number; token: string; total: number }>> {
  { const g = await deny("cs.agent", "orders.handle"); if (g) return g; }
  const sb = await supabaseServer();
  const { data, error } = await sb.rpc("cs_place_order", { p_district: o.district, p_phone: o.phone, p_name: o.name, p_address: o.address, p_note: o.note, p_pay: o.pay, p_lines: o.lines, p_channel: o.channel });
  if (error) return { ok: false, error: dbMsg(error.message) };
  const r = data as { no: number; token: string; total: number };
  return { ok: true, no: Number(r.no), token: r.token, total: Number(r.total) };
}
export async function makeCart(o: { district: number; lines: { item_id: number; qty: number }[]; phone: string; name: string; address: string }): Promise<Result<{ id: string }>> {
  { const g = await deny("cs.agent", "orders.handle"); if (g) return g; }
  const sb = await supabaseServer();
  const { data, error } = await sb.rpc("cs_make_cart", { p_district: o.district, p_items: o.lines, p_phone: o.phone, p_name: o.name, p_address: o.address });
  if (error) return { ok: false, error: dbMsg(error.message) };
  return { ok: true, id: String(data) };
}

// ===== الحجوزات =====
export type Slot = { slot: string; at: string; ok: boolean; full: boolean };
export async function getSlots(district: number, date: string): Promise<Slot[]> {
  const sb = await supabaseServer();
  const { data } = await sb.rpc("booking_slots", { p_district: district, p_date: date });
  return (data ?? []) as Slot[];
}
export async function bookOrder(o: { district: number; phone: string; name: string; address: string; note: string; pay: string; channel: string; lines: { item_id: number; qty: number }[]; date: string; slot: string }): Promise<Result<{ no: number; token: string; total: number }>> {
  const sb = await supabaseServer();
  const { data, error } = await sb.rpc("book_order", { p_district: o.district, p_phone: o.phone, p_name: o.name, p_address: o.address, p_note: o.note, p_pay: o.pay, p_lines: o.lines, p_channel: o.channel, p_date: o.date, p_slot: o.slot });
  if (error) return { ok: false, error: dbMsg(error.message) };
  const r = data as { no: number; token: string; total: number };
  return { ok: true, no: Number(r.no), token: r.token, total: Number(r.total) };
}
export async function editBooking(o: { token: string; lines?: { item_id: number; qty: number }[] | null; date?: string | null; slot?: string | null; address?: string | null; note?: string | null; cancel?: boolean; reason?: string | null }): Promise<Result<{ total?: number }>> {
  const sb = await supabaseServer();
  const { data, error } = await sb.rpc("booking_edit", { p_token: o.token, p_lines: o.lines ?? null, p_date: o.date ?? null, p_slot: o.slot ?? null, p_address: o.address ?? null, p_note: o.note ?? null, p_cancel: !!o.cancel, p_reason: o.reason ?? null });
  if (error) return { ok: false, error: dbMsg(error.message) };
  return { ok: true, total: Number((data as { total?: number })?.total ?? 0) };
}
